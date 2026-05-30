# 阿里云轻量服务器部署说明

服务器信息：

- 公网 IP：`39.103.91.85`
- 私网 IP：`172.24.51.22`
- 默认部署目录：`/opt/tongpinwang`
- 默认服务端口：`80`
- 默认数据目录：`/opt/tongpinwang/data`
- 默认备份目录：`/opt/tongpinwang/backups`

## 部署目标

这套部署会运行真正带后台数据的后端服务：

- 前台：`http://39.103.91.85/`
- 后台：`http://39.103.91.85/admin`
- 健康检查：`http://39.103.91.85/api/health`

当前阿里云轻量服务器使用 `systemd + Python3` 部署。数据保存在服务器 SQLite 文件 `/opt/tongpinwang/data/app.db`，服务重启或重新部署后不会丢失。

## 一键部署

在本机项目目录执行：

```bash
SERVER_HOST=39.103.91.85 \
SERVER_USER=root \
SSH_KEY=tmp/tongpin_deploy_key \
APP_PORT=80 \
TONGPIN_ADMIN_EMAIL=你的管理员邮箱 \
TONGPIN_ADMIN_PASSWORD=你的强密码 \
TONGPIN_SUPPORT_WECHAT=你的客服微信 \
scripts/deploy_aliyun_systemd.sh
```

如果不设置 `TONGPIN_ADMIN_PASSWORD`，脚本会自动生成一个随机强密码，并在部署完成后输出一次。

## 服务器要求

- SSH 端口 `22` 可访问
- 公网端口 `80` 需要在阿里云安全组中放行
- 登录用户需要能写入 `/opt/tongpinwang`、`/etc/tongpinwang.env` 和 `/etc/systemd/system/tongpinwang.service`
- 当前服务器 Docker Hub 拉镜像存在超时，因此优先使用 `scripts/deploy_aliyun_systemd.sh`

## 常用维护命令

进入服务器：

```bash
ssh -i tmp/tongpin_deploy_key root@39.103.91.85
cd /opt/tongpinwang
```

查看服务：

```bash
systemctl status tongpinwang
journalctl -u tongpinwang -f
```

重启服务：

```bash
systemctl restart tongpinwang
```

查看健康状态：

```bash
curl -fsS http://127.0.0.1/healthz
curl -fsS http://127.0.0.1/api/health
```

## 备份数据

```bash
ssh -i tmp/tongpin_deploy_key root@39.103.91.85
cd /opt/tongpinwang
TONGPIN_DATA_DIR=/opt/tongpinwang/data \
TONGPIN_BACKUP_DIR=/opt/tongpinwang/backups \
scripts/backup_db.sh
```

备份文件会生成在：

```text
/opt/tongpinwang/backups
```

## 后续接域名

现在可以先用 `http://39.103.91.85/` 验证真实数据。等你有域名并完成备案后，再把域名解析到 `39.103.91.85`，然后接 HTTPS。

接 HTTPS 后建议同步设置：

```text
TONGPIN_COOKIE_SECURE=1
```
