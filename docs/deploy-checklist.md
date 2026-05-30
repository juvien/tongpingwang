# 同频局 H5 上线清单

## 1. 准备仓库

- 确认 `server.py`、`static/`、`render.yaml`、`Procfile` 已提交
- 不要把本地 `data/app.db` 提交到线上仓库
- 管理员账号改成正式邮箱和强密码

## 2. Render 部署

1. 新建 GitHub 仓库并推送当前项目
2. 在 Render 里选择 `New +` -> `Blueprint`
3. 连接 GitHub 仓库，Render 会读取 `render.yaml`
4. 首次部署完成后，记录自动分配的公网域名

## 3. 环境变量

- `TONGPIN_ADMIN_EMAIL`
- `TONGPIN_ADMIN_PASSWORD`
- `TONGPIN_SUPPORT_WECHAT`
- `TONGPIN_SUPPORT_HOURS`
- `TONGPIN_SUPPORT_MESSAGE`
- `TONGPIN_COOKIE_SECURE=1`

## 4. 上线后核对

- 打开首页确认主视觉、活动卡片、测试和资料页样式正常
- 访问 `/healthz` 返回 `ok`
- 访问 `/api/health` 返回 JSON 状态
- 新注册一个测试账号，确认后台能看到
- 提交一条线索报名，确认后台线索池能看到
- 管理员账号能登录后台

## 5. 建议马上补上的正式能力

- 域名解析和备案
- 访问统计和埋点
- 表单消息提醒
- 数据定期备份
- 正式客服微信和社群 SOP

## 6. 后端数据版补充

如果你需要后台真实看到用户、线索、活动报名和预售记录，必须部署 `server.py`，不能只用 GitHub Pages 静态站。

推荐两种方式：

- Render Blueprint：使用 `render.yaml`，并确认持久化磁盘挂载到 `/opt/render/project/src/data`
- Docker / 云服务器：使用 `Dockerfile` 和 `docker-compose.yml`，数据保存在 Docker volume `tongpin-data`

详细步骤见 [后端数据版部署说明](backend-deploy.md)。
