jzsms
===

**警告：程序尚不完备，数据库结构也在修改中，请不要投入使用！**

本程序旨在借助QQ机器人模拟建周短信平台发送短信。

# 如何安装
该接口除了程序本身以外，还需要安装酷Q和CQ HTTP API插件才能向QQ群发送消息。

## 安装酷Q并配置HTTP API插件
* 安装[酷Q](https://cqp.cc/)（建议用Windows服务器。如用Linux服务器，可参考[wine配置教程](https://cqp.cc/t/30970)，或者使用[Docker镜像](https://cqp.cc/t/34558)）。
* 安装并配置[CoolQ HTTP API 插件](https://github.com/richardchien/coolq-http-api)。

## 启动接口
* 安装Node.js和MySQL，开放服务器8081端口。
* 初始化数据库：
```
mysql -h 数据库地址 -u root -p < init.sql
```
* 将config.example.js改名为config.js，并根据实际情况进行配置。
* 启动：
```
npm i
node duanxin.js
```
* 建议使用[forever](https://www.npmjs.com/package/forever)使程序驻守。
* 访问 http://服务器IP:8081/JianzhouSMSWSServer/services/BusinessService?wsdl 如显示WSDL内容则说明启动成功。

## 初始化用户
用以下命令生成密码：
```bash
echo "console.log(require('bcrypt').hashSync('密码', 10))" | node
```

运行以下SQL语句：
```sql
INSERT INTO accounts (name, secret, is_sms) VALUES ('用户名', '上面命令生成的密钥', 1);

-- 查询刚生成的user_id
SELECT id FROM accounts WHERE name='用户名';

-- QQ群设置
INSERT INTO account_targets (user_id, type, target) VALUES (查询出来的id, 'qq', 'QQ群号码');

-- 通讯录（根据实际需要）
INSERT INTO contacts (user_id, mobile_phone, name) VALUES (查询出来的id, '电话号', '姓名');
```

## 其他设置
* badwords：敏感词

# 本地调用
通过WebServices服务形式调用。原始请求内容：

```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <xs:sendBatchMessage xmlns:xs="http://service.nineorange.com">
            <xs:account>用户名</xs:account>
            <xs:password>密码</xs:password>
            <xs:destmobile>电话号</xs:destmobile>
            <xs:msgText>短信内容</xs:msgText>
        </xs:sendBatchMessage>
    </soap:Body>
</soap:Envelope>
```

返回码大于0时表示成功。

# 关于生产环境
本节内容与公司项目有关，与本程序无关。

## 如何申请在生产环境使用短信接口
1. 项目设计文档需要体现“使用短信”。
2. 向系统管理员提交短信接口申请，提交设计文档、预计短信发送量，并说明哪些服务器需要访问短信接口。
3. 中心安全科同意之后，申请开通端口。
4. 在服务器上面修改hosts。如果没有权限修改，联系系统管理员：
```
139.196.192.225 www.jianzhou.sh.cn
```

## 接口调用注意事项
1. 禁止相同的内容多个手机号连续一条一条提交，请连接号码使用群发方法提交, 否则禁用帐号。
2. 所有帐号提交短信，必须等上一批提交返回后再提交下一批，即同步提交。禁止使用多线程，异步提交，否则禁用帐号。（本程序也加入了校验，超速提交会给出提醒但不禁止）
3. 任何单一帐号在没余额情况下仍继续提交，超过10次后，服务器会自动封该帐号公网IP，该帐号充值后会自动解封。（备注：费用由中心安全科负责）
4. 任何一IP在连续错误帐号密码情况下仍继续提交，超过10次后，服务器会自动封该IP。
5. 短信内容最后请自带签名（例如“【中国海事局】”），而且短信其他部分不要含有“【”和“】”，否则用户无法收到短信。（本程序已加入校验）
6. 由于动态中心各应用共用同一互联网出口，其他厂商系统违反短信平台使用规则也会导致你的业务系统发不出短信。

# TODO
* SQLite支持
* 管理界面

# 感谢
* [酷Q](https://cqp.cc/)
* [coolq-http-api](https://github.com/richardchien/coolq-http-api)
