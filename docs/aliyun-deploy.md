# 阿里云轻量服务器部署说明

服务器信息：

- 公网 IP：`39.103.91.85`
- 私网 IP：`172.24.51.22`
- 默认部署目录：`/opt/tongpinwang`
- 默认服务端口：`8000`

## 部署目标

这套部署会运行真正带后台数据的后端服务：

- 前台：`http://39.103.91.85:8000/`
- 后台：`http://39.103.91.85:8000/admin`
- 健康检查：`http://39.103.91.85:8000/api/health`

数据会保存在 Docker volume `tongpin-data` 中，容器重启后不会丢失。

## 一键部署

在本机项目目录执行：

```bash
SERVER_HOST=39.103.91.85 \
SERVER_USER=root \
TONGPIN_ADMIN_EMAIL=你的管理员邮箱 \
TONGPIN_ADMIN_PASSWORD=你的强密码 \
TONGPIN_SUPPORT_WECHAT=你的客服微信 \
scripts/deploy_aliyun.sh
```

如果不设置 `TONGPIN_ADMIN_PASSWORD`，脚本会自动生成一个随机强密码，并在部署完成后输出一次。

## 服务器要求

- SSH 端口 `22` 可访问
- 公网端口 `8000` 需要在阿里云安全组中放行
- 如果未来使用域名，可以再放行 `80` 和 `443`，并接 Nginx/Caddy 做 HTTPS
- 登录用户需要能安装 Docker，推荐使用 `root`

## 常用维护命令

进入服务器：

```bash
ssh root@39.103.91.85
cd /opt/tongpinwang
```

查看服务：

```bash
docker compose ps
docker compose logs -f tongpin
```

重启服务：

```bash
docker compose restart
```

更新部署：

```bash
scripts/deploy_aliyun.sh
```

## 备份数据

```bash
ssh root@39.103.91.85
cd /opt/tongpinwang
docker compose exec tongpin bash -lc 'TONGPIN_DATA_DIR=/app/data TONGPIN_BACKUP_DIR=/app/backups scripts/backup_db.sh'
```

## 后续接域名

现在可以先用 `http://39.103.91.85:8000/` 验证真实数据。等你有域名并完成备案后，再把域名解析到 `39.103.91.85`，然后接 HTTPS。
