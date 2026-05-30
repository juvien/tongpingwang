# 同频局后端数据版部署说明

这份说明用于部署真正带后台数据的版本。它和 GitHub Pages 静态预览不同，所有注册、线索、活动报名、预售意向和后台审核数据都会写入服务端 SQLite 数据库。

## 部署前必须确认

- 线上必须配置持久化数据目录，默认数据库文件是 `app.db`
- 线上必须修改管理员邮箱和强密码
- 不要把 `data/app.db` 提交到 GitHub
- 如果使用 HTTPS，设置 `TONGPIN_COOKIE_SECURE=1`

## 环境变量

```bash
HOST=0.0.0.0
PORT=8000
TONGPIN_DATA_DIR=/app/data
TONGPIN_ADMIN_EMAIL=admin@example.com
TONGPIN_ADMIN_PASSWORD=replace-with-a-strong-password
TONGPIN_SUPPORT_WECHAT=YourWechat
TONGPIN_SUPPORT_HOURS=每日 12:00 - 22:00
TONGPIN_SUPPORT_MESSAGE=添加客服后备注“同频局”，我们会把你拉入对应城市的兴趣社群。
TONGPIN_COOKIE_SECURE=1
TONGPIN_SHOW_ADMIN_PASSWORD=0
```

## 方案 A：Render 蓝图部署

适合继续用 GitHub 图形界面上线。

1. 确保代码已经推送到 GitHub 仓库 `juvien/tongpingwang`
2. 在 Render 选择 `New +` -> `Blueprint`
3. 选择该仓库，Render 会读取根目录的 `render.yaml`
4. 确认服务有持久化磁盘，挂载路径是 `/opt/render/project/src/data`
5. 在环境变量里设置正式管理员账号、客服微信和 `TONGPIN_COOKIE_SECURE=1`
6. 部署完成后访问：

```text
https://你的-render-域名/
https://你的-render-域名/admin
https://你的-render-域名/api/health
```

## 方案 B：Docker / 云服务器部署

适合你有自己的服务器，数据最可控。

1. 在服务器安装 Docker 和 Docker Compose
2. 拉取仓库或上传代码
3. 创建 `.env`

```bash
cp .env.example .env
```

4. 修改 `.env` 里的管理员账号、密码、客服信息
5. 启动服务

```bash
docker compose up -d --build
```

6. 查看状态

```bash
docker compose ps
docker compose logs -f tongpin
```

7. 验证接口

```bash
curl -fsS http://127.0.0.1:8000/healthz
curl -fsS http://127.0.0.1:8000/api/health
```

## 数据备份

本地或服务器裸跑时：

```bash
scripts/backup_db.sh
```

Docker 部署时：

```bash
docker compose exec tongpin bash -lc 'TONGPIN_DATA_DIR=/app/data scripts/backup_db.sh'
```

如果容器镜像中没有 `sqlite3` 命令，可以在宿主机备份 Docker volume，或先使用服务器系统包安装 `sqlite3` 后对挂载目录备份。

## 数据恢复

```bash
scripts/restore_db.sh backups/app-YYYYMMDD-HHMMSS.db.gz
```

恢复前脚本会把现有数据库复制为 `app.db.before-restore-*`。

## 上线验收清单

- 首页可以打开
- `/healthz` 返回 `ok`
- `/api/health` 返回 `status: ok` 和 `database: ok`
- 新注册一个普通账号后，后台用户列表能看到
- 提交一条体验官报名后，后台线索池能看到
- 提交一次活动报名后，后台可导出 CSV
- 管理员账号能登录 `/admin`
- 服务器重启或容器重启后，之前注册的数据仍然存在

## 当前静态站和后端站的区别

- `https://juvien.github.io/tongpingwang/` 是公开展示站，适合投放给用户预览和测试页面转化
- 后端数据版必须使用 Render、Docker 或云服务器地址，才能集中保存注册、线索、活动和后台数据
