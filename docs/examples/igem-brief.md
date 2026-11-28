# Arsenic in soil: a field-deployable whole-cell biosensor — 选题简报

> Worked example. The numbers are illustrative and shaped like a real brief; they
> are not a historical claim. Template: [verticals/igem/brief.md](../../verticals/igem/brief.md).

## 一句话

我们给省级环境监测站做一个砷现场检测，用 *Bacillus subtilis* 里的
arsenic-responsive repressor，读出是比色，目标是检出限 **< 10 µg/L**，单样
**< 30 min**。

## 问题

- 现况：目标省份每年约 12,000 个农田土壤样本需要砷筛查（2024 年口径）。
- 现有解法：实验室 ICP-MS，约 **80 CNY/样**，**3–5 day** 周转，需要冷链和固定实验室。
- 卡在哪：现场没有 **10 µg/L** 级别的定量读出；现有试纸只给半定量。
- 生物方案：把 repressor 的剂量响应接到比色读出，目标在 **25 °C、pH 6.5–7.5、土壤提取液** 下做到 **< 10 µg/L**，比现有试纸低一个量级。

## 方案

- 机制：砷结合 repressor → 解除对 reporter 的抑制 → 比色底物显色。
- 为什么这次能成：repressor 和 RBS 都有同行评议表征；我们只改宿主和读出接口。
- 和现有方案比：检出限目标低 **10×**；单样时间目标低 **6×**；成本目标 **< 15 CNY/样**。

## Components

| Component | Source | Grade | Decision | Weeks | Cost (USD) |
|---|---|---|---|---|---|
| Arsenic repressor | paper | A | reuse | 1 | 0 |
| Strong RBS | Registry | A | reuse | 1 | 0 |
| Colorimetric reporter | Registry | C | build | 6 | 400 |
| Soil extraction protocol | team wiki | B | recharacterise | 3 | 50 |

Reuse: 2 · Re-characterise: 1 · Build: 1

## Timeline

- p50 **6.1 weeks**; p90 **7.8 weeks**.
- 8-week probability **82%**; calendar **10.4 weeks** (8 summer weeks + 12 term
  weeks × 8 weekend hours / 40 hours).
- Gate 4: **pass**.
- Bottlenecks: build, colorimetric characterisation.

## Material balance

- feasible: **true**.
- limiting: none.
- theoretical yield: **2.1×** the target at the assumed 20 µM precursor pool.
- notes: the estimate assumes the precursor is supplied, not synthesised in the host.

## 风险与备用

| 风险 | 触发信号 | 备用方案 |
|---|---|---|
| 构建不出来 | 两周内无正确克隆 | 换宿主表达 |
| 灵敏度不够 | 动态范围 < 5 倍 | 换读出或加放大级 |
| 现场基质抑制 | 土壤提取液回收率 < 50% | 缩范围到实验室提取液 |
| 时间不够 | p90 > 10.4 weeks | 缩范围到一个 Village 的样本类型 |

## 还没搞清的

- 土壤提取液里砷的种态分布是否稳定（没有查到本省数据）。
- 比色底物在 25 °C 下的稳定性（只有 37 °C 数据）。
- 监测站是否愿意为 15 CNY/样 的现场筛查付费（需要 5 个访谈）。
- 宿主在土壤提取液中的存活时间（没有查到）。
