module.exports = {
    db: {
        url: 'mongodb://账号:密码@数据库IP:27017/数据库名',
        name: '数据库名',
    },
    bots: {
        qq: {               // QQ机器人接口设置
            apiUrl: 'http://你的服务器:5700',
            token: '你的token',
            secret: '你的secret'
        },
    },
    server: {
        ip: '0.0.0.0',      // 短信接口监听地址
        port: 8101,         // 短信接口监听端口
    },
};
