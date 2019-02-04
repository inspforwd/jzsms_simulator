module.exports = {
    db: {
        type: 'mysql',
        mysql: {
            host: '数据库IP',
            database: 'jzsms',
            user: '用户名',
            password: '密码',
        },
    },
    bots: {
        qq: {               // QQ机器人接口设置
            apiUrl: 'http://127.0.0.1:5700',
            token: '你的token',
            secret: '你的secret'
        },
    },
    server: {
        ip: '0.0.0.0',      // 短信接口监听地址
        port: 8101,         // 短信接口监听端口
    },
};
