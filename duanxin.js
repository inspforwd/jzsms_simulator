'use strict';

const http = require('http');
const soap = require('soap');
const MongoClient = require('mongodb').MongoClient;
const CQHttp = require('cqhttp');

const config = require('./config.js');

/**
 * 公共方法
 */
const logger = {
    _prefix: () => {
        let date = new Date().toISOString();
        return `[${date.substring(0, 10)} ${date.substring(11, 19)}]`;
    },

    _output: (level, isErr, ...message) => {
        if (isErr) {
            console.error(logger._prefix(), `[${level}]`, ...message);
        } else {
            console.log(logger._prefix(), `[${level}]`, ...message);
        }
    },

    debug: (...message) => logger._output('DEBUG', false, ...message),
    info: (...message) => logger._output('INFO', false, ...message),
    warn: (...message) => logger._output('WARN', true, ...message),
    error: (...message) => logger._output('ERROR', true, ...message),
};


/**
 * 根据手机号获取姓名
 */
const getPersonName = async mobile => {
    let db = await MongoClient.connect(config.db.url);
    let result = '';
    try {
        let col = await db.db(config.db.name).collection('names');
        let r = await col.findOne({ 'mobile_phone': mobile });
        if (r) {
            result = r.name;
        }
    } finally {
        db.close();
    }
    return result;
};

/**
 * 获取用户信息
 */
const getUserInfo = async (account, password) => {
    let db = await MongoClient.connect(config.db.url);
    let result = null;
    try {
        let col = await db.db(config.db.name).collection('users');
        let r = await col.findOne({ 'username': account, 'password': password });
        if (r) {
            result = {
                username: account,
                name: r.name,
                enabled: r.enabled,
                targets: r.targets,
            };
        } else {
            throw new Error('帐号或密码错误');
        }
    } finally {
        db.close();
    }
    return result;
};

/**
 * 保留发送记录
 */
const insertRecord = async (account, mobile, name, content, success, remark) => {
    let db = await MongoClient.connect(config.db.url);
    try {
        let col = await db.db(config.db.name).collection('message_record');
        await col.insertOne({
            account,
            mobile,
            name,
            content,
            time: new Date(),
            success,
            remark,
        });
    } finally {
        db.close();
    }
};

/**
 * 敏感词库，每分钟更新一次
 */
let badwords = [];
const loadBadwords = async _ => {
    let db = null;
    try {
        db = await MongoClient.connect(config.db.url);
        let col = await db.db(config.db.name).collection('badwords');
        badwords = await col.find({ enabled: true }).sort({ priority: 1 }).toArray();
    } catch (e) {
        logger.error('更新敏感词列表时出错', e);
    } finally {
        if (db) {
            try {
                db.close();
            } catch (e) {
                logger.error('关闭连接时出错', e);
            }
        }
    }
};
setInterval(loadBadwords, 60 * 1000);
loadBadwords().catch(_ => { });

/**
 * QQ机器人部分
 */
const bot = new CQHttp({
    apiRoot: config.bots.qq.apiUrl,
    accessToken: config.bots.qq.token,
    secret: config.bots.qq.secret,
});

const sendMessage = async args => {
    let account = args.account;
    let password = args.password;
    let user = await getUserInfo(account, password);
    if (!user) {
        throw new Error('帐号或密码错误');
    }
    if (!user.enabled) {
        throw new Error('余额不足');
    }

    let destmobiles = args.destmobile.split('||');
    let msgtexts = args.msgText.split('||');
    for (let [i, destmobile] of destmobiles.entries()) {
        let msgtext = msgtexts[i];
        let name = null;
        let output;
        try {
            name = await getPersonName(destmobile);
            if (name) {
                output = `[To] ${name} <${destmobile}>:`;
            } else {
                output = `[To] ${destmobile}:`;
            }

            // 检查签名
            let match = msgtext.match(/【.*?】/g);
            if (!match) {
                msgtext = '** 错误！短信内容缺少花括号签名，不允许发送！原始内容为：\n' + msgtext;
            } else if (match.length > 1) {
                msgtext = '** 错误！短信内容有多个花括号签名，不允许发送！原始内容为：\n' + msgtext;
            }

            // 处理敏感词
            let stop = false;
            for (let badword of badwords) {
                if (badword.pattern && msgtext.match(badword.pattern)) {
                    if (badword.action === 'ignore') {
                        stop = true;
                        break;
                    } else if (badword.action === 'replace') {
                        msgtext = msgtext.replace(new RegExp(badword.pattern, 'g'), badword.replace_to);
                    }
                }
            }

            if (!stop) {
                output = `${output}\n${msgtext}`;
                logger.debug(output);

                for (let target of user.targets) {
                    if (target.type === 'qq') {
                        await bot('send_group_msg', {
                            group_id: target.id,
                            message: output,
                            auto_escape: true
                        });
                    }
                }
            }

            await insertRecord(account, destmobile, name, msgtext, true, '');
        } catch (e) {
            logger.error('发送短信时出错', e);
            await insertRecord(account, destmobile, name, msgtext, false, e.message);
        }
    }
};


/**
 * 短信接口
 */
const myService = {
    BusinessServiceService: {
        BusinessServicePort: {
			/**
			 * 用户名密码校验
			 * @param args { account: 'xxx', password: 'xxx' }
			 * @return 1-用户名密码正确，其他-不正确
			 */
            validateUser: (args, callback) => {
                getUserInfo(args.account, args.password).then(user => {
                    if (!user) {
                        callback('0');
                    } else {
                        callback('1');
                    }
                }).catch(_ => {
                    callback('0');
                });
            },

			/**
			 * 发送短信
			 * @param args { account: 'xxx', password: 'xxx', destmobile: '13012345678', msgText: '短信内容' }
			          手机号英文分号隔开
			 * @return 大于0表示发送成功，其他值：
						<value>-1|余额不足</value>
						<value>-2|帐号或密码错误</value>
						<value>-3|连接服务商失败</value>
						<value>-4|超时</value>
						<value>-5|其他错误，一般为网络问题，IP受限等</value>
						<value>-6|短信内容为空</value>
						<value>-7|目标号码为空</value>
						<value>-8|用户通道设置不对，需要设置三个通道</value>
						<value>-9|捕获未知异常</value>
						<value>-10|超过最大定时时间限制</value>
						<value>-11|目标号码在黑名单里</value>
						<value>-12|消息内容包含禁用词语</value>
						<value>-13|没有权限使用该网关</value>
						<value>-14|找不到对应的Channel ID</value>
						<value>-17|没有提交权限，客户端帐号无法使用接口提交</value>
						<value>-20|超速提交(一般为每秒一次提交)</value>
						<value>-21|平台未知异常</value>
						<value>-22|IP被封</value>
			 */
            sendBatchMessage: (args, callback) => {
                if (!args.destmobile) {
                    callback('-7');
                } else if (!args.msgText) {
                    callback('-6');
                } else {
                    sendMessage(args).then(_ => {
                        callback('1');
                    }).catch(ex => {
                        if (ex.message && ex.message === '帐号或密码错误') {
                            callback('-2');
                        } else if (ex.message && ex.message === '余额不足') {
                            callback('-1');
                        } else {
                            callback('-9');
                        }
                    });
                }
            },

			/**
			 * 获取用户信息
			 * @param args { account: 'xxx', password: 'xxx' }
			 * @return ?
			 */
            getUserInfo: args => {
                return '<userinfo><remainFee>100</remainFee></userinfo>';
            },
        }
    }
};


//http server example
const server = http.createServer((request, response) => {
	/*
	let body = '';

    request.on('data', function (data) {
        body += data;

        // Too much POST data, kill the connection!
        // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
        if (body.length > 1e6) {
            request.connection.destroy();
        }
    });

    request.on('end', function () {
        console.log(body);
        console.log('============================');
    });
    */

    response.end('404: Not Found: ' + request.url);
    logger.debug('404 Not Found:', request.url);
});

server.listen(config.server.port, config.server.ip);

const xml = require('fs').readFileSync('duanxin.wsdl', 'utf8');
soap.listen(server, '/JianzhouSMSWSServer/services/BusinessService', myService, xml);

logger.info(`Listening on http://${config.server.ip}:${config.server.port} ...`);
