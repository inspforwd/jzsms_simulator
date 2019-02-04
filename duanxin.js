'use strict';

const http = require('http');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const soap = require('soap');
const winston = require('winston');
const CQHttp = require('cqhttp');

/**
 * 加载设置
 */
const config = require('./config.js');
const ERRCODE = {
    SUCCESS: 1,
    NO_FEE: -1,
    WRONG_USERPASS: -2,
    TIMEOUT: -4,
    OTHER_ERR: -5,
    EMPTY_CONTENT: -6,
    EMPTY_MOBILE: -7,
    UNKNOWN: -9,
    BLACKLIST: -11,
    TOOFAST: -20,
};

/**
 * 加载各组件
 */
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format(info => {
            info.level = info.level.toUpperCase();
            return info;
        })(),
        winston.format.colorize(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(info => `${info.timestamp} <${info.level}> ${info.message}`)
    ),
    transports: [new winston.transports.Console()]
});

const pool = mysql.createPool({
    host: config.db.mysql.host,
    database: config.db.mysql.database,
    user: config.db.mysql.user,
    password: config.db.mysql.password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();

const qqbot = new CQHttp({
    apiRoot: config.bots.qq.apiUrl,
    accessToken: config.bots.qq.token,
    secret: config.bots.qq.secret,
});

const server = http.createServer((request, response) => {
    response.end('404: Not Found: ' + request.url);
});

/**
 * 并发提交问题
 */
const working_status = new Map();

/**
 * 根据手机号获取姓名
 * @param {*} user_id 
 * @param {*} mobile_phone 
 */
const getPersonName = async (user_id, mobile_phone) => {
    const [ rows ] = await pool.query('SELECT name FROM contacts WHERE user_id=? AND mobile_phone=?', [user_id, mobile_phone]);
    if (rows && rows[0]) {
        return rows[0].name;
    } else {
        return '';
    }
};

/**
 * 获取用户信息，无信息或认证失败会返回null
 * @param {*} name 
 * @param {*} password 
 */
const getUserInfo = async (name, password) => {
    const [ rows ] = await pool.query('SELECT * FROM accounts WHERE name=?', [name]);
    if (rows && rows[0]) {
        const row = rows[0];
        const match = await bcrypt.compare(password, row.secret);
        if (match) {
            const [ targets ] = await pool.query('SELECT * FROM account_targets WHERE user_id=? AND is_enabled=1', [row.id]);
            return {
                id: row.id,
                name: row.name,
                nickname: row.nickname,
                enabled: row.is_locked === 0,
                targets: targets,
            };
        }
    }
    return null;
};

/**
 * 保留发送记录
 * @param {*} param 发送内容
 */
const insertRecord = async (param) => {
    await pool.execute('INSERT INTO sms_records (user_id, mobile_phone, name, content, send_time, is_success, remark) VALUES (?, ?, ?, ?, sysdate(), ?, ?)', [
        param.user_id,
        param.mobile_phone,
        param.name,
        param.content,
        param.is_success,
        param.remark,
    ]);
};

/**
 * 敏感词库，每分钟更新一次
 */
let badwords = [];
const loadBadwords = async _ => {
    try {
        const [ rows ] = await pool.query(`SELECT pattern, action, replace_to, user_id FROM badwords WHERE is_enabled=1`);
        badwords = rows;
    } catch (e) {
        logger.error('更新敏感词列表时出错', e);
    }
};
setInterval(loadBadwords, 60 * 1000);
loadBadwords().then(_ => logger.info('已加载敏感词列表。')).catch(_ => {});

/**
 * 发送短信
 * @param {*} args 接口参数
 */
const sendMessage = async args => {
    let account = args.account;
    let password = args.password;
    let warnmsg = '';
    let user = await getUserInfo(account, password);
    if (!user) {
        return ERRCODE.WRONG_USERPASS;
    }
    if (!user.enabled) {
        return ERRCODE.NO_FEE;
    }

    if (working_status.get(account)) {
        // 拒绝超速提交则使用return，仅提醒的话将return注释掉
        // return ERRCODE.TOOFAST;
        warnmsg = '[警告：检测到超速提交]';
    }
    working_status.set(account, true);

    // 短信拆分
    let destmobiles = args.destmobile.split('||');
    let msgtexts = args.msgText.split('||');
    for (let [i, destmobile] of destmobiles.entries()) {
        let msgtext = msgtexts[i];
        let name = null;
        let output;
        try {
            name = await getPersonName(user.id, destmobile);
            if (name) {
                output = `[To] ${name} <${destmobile}>: `;
            } else {
                output = `[To] ${destmobile}: `;
            }

            // 检查签名
            let match = msgtext.match(/【.*?】/g);
            if (!match) {
                warnmsg = warnmsg + '[警告：短信内容缺少签名！]';
            } else if (match.length > 1) {
                warnmsg = warnmsg + '[警告：短信内容有多个签名！]';
            }

            // 处理敏感词
            let stop = false;
            let callpolice = null;
            const mybadwords = badwords.map(w => (w.user_id === null || w.user_id === user.id));
            for (let badword of badwords) {
                if (msgtext.match(badword.pattern)) {
                    if (badword.action === 'ignore') {
                        stop = true;
                        break;
                    } else if (badword.action === 'replace') {
                        msgtext = msgtext.replace(new RegExp(badword.pattern, 'g'), badword.replace_to);
                    } else if (badword.action === 'error') {
                        callpolice = badword.replace_to;
                        break;
                    }
                }
            }

            if (callpolice) {
                msgtext = callpolice;
            }

            if (!stop) {
                output = `${output}${warnmsg}\n${msgtext}`;
                logger.debug(output);

                for (let target of user.targets) {
                    if (target.type === 'qq') {
                        await qqbot('send_group_msg', {
                            group_id: target.target,
                            message: output,
                            auto_escape: true
                        });
                    }
                }
            }

            await insertRecord({
                user_id: user.id,
                mobile_phone: destmobile,
                name: name,
                content: msgtext,
                is_success: true
            });
        } catch (e) {
            logger.error('发送短信时出错', e);
            await insertRecord({
                user_id: user.id,
                mobile_phone: destmobile,
                name: name,
                content: msgtext,
                is_success: false,
                remark: e.message,
            });
        }
    }
    return ERRCODE.SUCCESS;
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
                    sendMessage(args).then(result => {
                        working_status.set(args.account, false);
                        callback(`${result}`);
                    }).catch(_ => {
                        working_status.set(args.account, false);
                        callback('-9');
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

server.listen(config.server.port, config.server.ip);

const xml = require('fs').readFileSync('duanxin.wsdl', 'utf8');
soap.listen(server, '/JianzhouSMSWSServer/services/BusinessService', myService, xml);

logger.info(`接口已启动，URL：http://${config.server.ip}:${config.server.port}/JianzhouSMSWSServer/services/BusinessService`);
