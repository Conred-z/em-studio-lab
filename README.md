# EM Studio · 高斯混合模型算法实验室

面向“数据挖掘与算法应用”翻转课堂的 B/S 参数调节与逐步可视化系统。核心 EM 过程由 **NumPy 显式实现**，不调用现成的 GMM 聚类器代替算法过程；React 负责调参、交互与可视化，Flask 负责数据、实验会话与计算接口。

项目仓库：[github.com/Conred-z/em-studio-lab](https://github.com/Conred-z/em-studio-lab)

## 本地启动

在当前工作区中，已有上级目录 `.venv`（Flask + NumPy）时：

```bash
npm install
npm run build
npm run dev
```

浏览器打开 `http://localhost:7100/`。可通过以下方式改变监听地址和端口：

```bash
npm run dev -- --host 127.0.0.1 --port 7100
```

在新环境中，先安装 Node.js 22+ 与 Python 3.12+，再准备依赖：

```bash
npm install
python3 -m pip install -r requirements.txt
npm run build
npm run dev
```

启动器会优先使用 `../.venv/bin/python`，否则使用 `python3`；也可用环境变量 `EM_PYTHON` 指定解释器。`npm run dev` 启动 Flask，由同一端口提供前端静态文件与 `/api` 计算接口。

## 部署到 Render

仓库根目录包含完整的生产部署配置：

- `Dockerfile`：先在 Node.js 阶段执行 `npm ci` 与前端构建，再在 Python 阶段安装 Flask、NumPy 和 Gunicorn。
- `render.yaml`：Render Blueprint，声明免费 Web Service、新加坡区域、健康检查和 GitHub 自动部署。
- Gunicorn 使用 **1 个进程、8 个线程**。EM 会话保存在进程内存中，不能通过增加 Worker 数来扩容，否则逐步请求可能落到没有对应会话的进程。

### 首次部署

1. 登录 Render，选择 **New → Blueprint Instance**。
2. 连接 GitHub 并选择 `Conred-z/em-studio-lab`。
3. Render 会自动识别根目录的 `render.yaml`，确认服务名为 `em-studio-lab`，然后应用配置。
4. 等待镜像构建和服务启动。健康检查地址为 `/api/health`，网页由同一个 `onrender.com` 地址提供。

也可以通过以下入口按 Blueprint 创建服务：

[Deploy to Render](https://render.com/deploy?repo=https://github.com/Conred-z/em-studio-lab)

### 更新与免费版限制

- `render.yaml` 中设置了 `autoDeployTrigger: commit`。向连接的 `main` 分支推送代码后，Render 会自动重新构建和部署。
- 免费服务连续 15 分钟没有访问会休眠，下次访问通常需要约 1 分钟唤醒；课堂演示前建议先打开一次。
- 休眠、重启或重新部署会清空服务端内存中的数据集和 EM 会话，重新选择数据并初始化即可。
- 最近 40 次实验摘要保存在访问者自己的浏览器 `localStorage` 中，不依赖服务端内存；上传的 CSV 不会写入数据库。

## 已实现功能

### 数据与预处理

- 5 种可控内置数据：三簇椭圆、重叠双峰、各向异性、不均衡样本、一维双峰。
- 样本量、簇间距离、噪声和数据随机种子可调。
- CSV 文件选择 / 拖入，自动识别数值字段，支持 UTF-8 与 GB18030。
- 自动剔除不完整记录；超过 1,500 条时固定随机抽样，保证交互性能。
- 1–8 个建模特征；原始尺度、Z-score、Min-Max。
- 超过二维时使用全部所选特征建模，图中展示前两个特征对应的边缘分布。

### EM 参数

- 混合分量数 K = 1–8。
- 完整、共享、对角、球形四种协方差结构。
- K-means++ + Lloyd、随机样本、随机责任度、手动质心四种初始化。
- 最大迭代次数、绝对 / 相对收敛阈值、协方差正则化。
- 随机种子、1–10 次随机重启、K-means 初始化轮数、空簇处理策略。
- 单步 E→M、连续迭代、运行至收敛、历史时间轴回放与速度调节。
- 多次重启在“运行至收敛”中完整执行并保留最高对数似然结果；逐步模式固定首个种子，便于讲解与复现。

### 可视化与分析

- 二维散点、1σ / 2σ 高斯椭圆、均值十字标记。
- 一维分量密度与总混合密度曲线。
- 软分配置信度着色、真实类别对照、样本责任度检查器。
- 对数似然曲线、混合权重堆积轨迹、最不确定样本矩阵。
- 当前 μ / Σ / π 参数表、AIC / BIC / ICL、平均熵、轮廓系数。
- K = 1–6 批量扫描与 BIC 推荐，可一键应用。
- 聚类 CSV（含责任度）、完整实验 JSON 导出。
- 最近 40 次完整实验保存在当前浏览器 localStorage；可导出、删除或载入参数。
- 算法讲义、公式、伪代码、课堂问题与三组一键演示。

## 系统结构

```text
app/
├── Dockerfile             # React 构建 + Flask/Gunicorn 生产镜像
├── render.yaml            # Render Blueprint 与自动部署配置
├── server.py              # Flask API、GMM-EM、数据生成与 CSV 解析
├── server.mjs             # 本地 npm 启动器，转发 --host / --port
├── test_em.py             # 数值与 API 回归测试
├── requirements.txt
├── src/
│   ├── App.tsx            # 实验状态机、实时迭代、导出与记录
│   ├── types.ts           # API 与实验类型
│   ├── components/
│   │   ├── ScatterPlot.tsx
│   │   ├── AnalysisViews.tsx
│   │   ├── ParameterPanel.tsx
│   │   ├── DataDialog.tsx
│   │   ├── Inspector.tsx
│   │   ├── TheoryView.tsx
│   │   └── HistoryView.tsx
│   └── lib/api.ts
└── dist/                  # 生产构建，由 Flask 提供（不提交到 Git）
```

主要接口：

| 接口 | 用途 |
| --- | --- |
| `POST /api/dataset/generate` | 生成内置数据 |
| `POST /api/dataset/upload` | 上传并识别 CSV |
| `POST /api/em/init` | 创建实验会话与第 0 帧 |
| `POST /api/em/step` | 在服务端执行一次真实 E→M |
| `POST /api/em/run` | 多次重启并运行至收敛 |
| `POST /api/em/sweep` | K 值与 AIC/BIC 扫描 |

## 算法说明

E 步使用 log-sum-exp 计算责任度，避免直接求混合密度时的数值上溢 / 下溢；M 步使用责任度加权估计混合权重、均值和协方差。正则化项为 `λI`。评估指标中的对数似然采用每样本均值，AIC/BIC/ICL 使用总对数似然和对应协方差结构的独立参数数。

系统聚焦于 **GMM-EM**，并未声称覆盖硬币抛掷、伯努利混合、HMM 等其他 EM 模型。上传数据与实验会话只保存在当前计算服务的内存中，服务休眠或重启后需要重新载入；实验记录不含上传的数据文件。

## 验证

```bash
npm run lint
npm run build
python test_em.py
```

测试覆盖四种协方差下的对数似然单调性、责任度归一、空簇重启、参数反标准化、CSV 自动识别、初始化 / 单步 / 收敛 / K 扫描接口。交付前还通过本机 Chrome 验证了完整浏览器流程、CSV/JSON 下载、移动端横向溢出和控制台 / 网络错误。
