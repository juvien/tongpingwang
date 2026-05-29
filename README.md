# 泛亚文化即时约会产品启动包

这个仓库整理了一套可直接用于内部立项的产品资料，面向中国大陆市场的泛亚文化圈层即时约会产品，形态为 `App + 小程序`。

## 文档目录

- [产品需求文档](docs/product-prd.md)
- [商业化企划书](docs/business-plan.md)
- [MVP 路线图](docs/mvp-roadmap.md)
- [5 万内低成本验证版](docs/lean-5w-plan.md)

## H5 验证站

仓库现在已经包含一个可本地运行的低成本全栈 H5 验证站，覆盖：

- 品牌介绍页
- 用户报名页
- 注册 / 登录
- 轻人格与兴趣测试
- 个人资料收集
- 匹配意向问卷
- 同频结果页
- 活动报名页
- 会员预售页
- 客服 / 社群承接入口
- 最小后台管理页

### 本地启动

```bash
python3 server.py
```

启动后访问：

- 前台：`http://127.0.0.1:8000/`
- 后台：`http://127.0.0.1:8000/admin`

默认管理员账号：

- 邮箱：`admin@tongpin.local`
- 密码：`Admin123!`

### 生产部署

仓库已经补齐基础部署文件：

- [Render 蓝图配置](render.yaml)
- [进程启动文件](Procfile)
- [环境变量示例](.env.example)
- [上线清单](docs/deploy-checklist.md)

默认支持以下环境变量：

- `HOST`
- `PORT`
- `TONGPIN_DATA_DIR`
- `TONGPIN_ADMIN_EMAIL`
- `TONGPIN_ADMIN_PASSWORD`
- `TONGPIN_SUPPORT_WECHAT`
- `TONGPIN_SUPPORT_HOURS`
- `TONGPIN_SUPPORT_MESSAGE`
- `TONGPIN_COOKIE_SECURE`

健康检查地址：

- `GET /healthz`
- `GET /api/health`

## 项目定位

- 目标人群：`18-30` 岁泛亚文化用户，覆盖二次元、摄影、livehouse、桌游、展会、市集等兴趣圈层
- 核心价值：先判断是否同频，再推进高质量互动与即时约会
- 产品策略：`App` 承接核心关系建立，`小程序` 承担拉新、测试、活动和召回
- 商业验证：优先验证 `会员订阅`，再补充道具、活动抽成与品牌合作

## 一期范围

- 注册与信任
- 人格与兴趣建档
- 发现与匹配
- 聊天与约会推进
- 轻社区内容
- 会员与付费
- 运营后台与数据看板

## 使用建议

- 用 [产品需求文档](docs/product-prd.md) 对齐产品、设计、技术范围
- 用 [商业化企划书](docs/business-plan.md) 做内部汇报、合伙人沟通或招商预案
- 用 [MVP 路线图](docs/mvp-roadmap.md) 拆启动节奏、团队配置和验收口径
- 用 [5 万内低成本验证版](docs/lean-5w-plan.md) 先做小预算试水，再决定要不要做完整 App
