# FinScope · 财务透镜

[![Windows 构建](https://github.com/freesaber/FinScope/actions/workflows/release.yml/badge.svg)](https://github.com/freesaber/FinScope/actions/workflows/release.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-236c60.svg)](LICENSE)

面向 A 股上市公司的开源财报分析客户端。输入股票代码，即可查看近三年年报与最新季报，了解利润归属、现金兑现、经营占款和债务压力。

无需登录，无需配置 API Key。

![客户端界面](docs/desktop.png)

## 主要功能

- 六个分析模块，提供原始数据、计算公式、参考区间与趋势图。
- 右上角目标价设置：在表格中为所有自选股填写买入价、卖出价并勾选监控，目标价会保存在本地。
- 独立价格监控开关：开启后立即查价，每 60 秒刷新全部自选公司的报价，卡片第二行显示价格及今日涨跌幅；仅勾选目标价监控的股票触发提醒；到达买入目标显示蓝色「买」，到达卖出目标显示紫色「卖」，离开条件自动恢复。软件重启后默认关闭监控，保留目标价。
- 自选财务地图用绿、黄、红方块展示未触发提示、需要关注与重点核查的公司，支持名称/代码定位和分类筛选；点击查看线索、跳转东方财富行情页或移除，支持同类公司拖动排序并自动保存，也可用 Alt + 方向键调整。
- 支持窗口最大化，最小窗口为 960×720；财务分类区域按 25%∶50%∶25% 分配，中间需要关注区更宽；卡片固定为 100×80 像素，每行数量随可用宽度自动变化，卡片按列均匀分布，横向间距自适应，末行与上方列对齐。
- 每次点击公司或输入代码查询均联网获取最新可用数据，不提供离线缓存读取；本地仅保留自选名单、顺序和上次筛选摘要，支持导出 CSV。

- 最小化到系统托盘，任务栏隐藏，价格监控继续；点击托盘图标恢复，右键菜单可退出。触价后右下角显示可关闭的小提醒，同一股票按北京时间每天最多提醒一次（买卖共用额度，重启不重复）。

## 下载安装

前往 [Releases](https://github.com/freesaber/FinScope/releases/latest)，下载 Windows x64 安装包，按向导安装。

支持 Windows 10 / 11，无需额外安装运行环境。更新时先退出旧版，再安装新版，原有查询记录会保留。安装包未进行商业代码签名，Windows 可能提示发布者未知。

## 本地运行

需要 Node.js 22（≥22.12）。

```powershell
git clone https://github.com/freesaber/FinScope.git
cd FinScope
npm ci
npm start
```

```powershell
npm test                 # 运行测试
npm run test:desktop     # 桌面功能验证
npm run dist             # 构建 Windows 安装包
```

## 数据与许可

数据来自东方财富公开网页接口，可能受接口变更或访问限制影响，请以公司最新公告为准。本工具仅供财务研究，分类与提示不构成投资建议。

采用 [MIT License](LICENSE)。版本更新内容见 [发布说明](https://github.com/freesaber/FinScope/releases)。
