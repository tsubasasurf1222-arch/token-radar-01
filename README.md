# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/tsubasasurf1222-arch/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/tsubasasurf1222-arch/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks 198 still-tokenless protocols by implied value — what a token would be worth if the protocol issued one today, on the record it already has — and gives the steps to farm each one before or after it does. The model is built only from the sealed snapshot's own figures: each protocol's implied value is its TVL times a category multiple, adjusted for 7-day growth, tokenless maturity and chain breadth. The multiples come from the snapshot's 128 token-bearing protocols, whose market-cap/TVL ratios are compared on the log scale; each category's multiple is its median log-ratio, geometrically shrunk toward the global median so a category priced off one or two wild comparables cannot dominate, and clamped to a sane band. The board covers all 40 of the house watchlist plus every other rankable pre-token protocol; wrapped, staked and bridged products of tokens that already trade are excluded as tokens in disguise, and the token-bearing protocols are listed separately at market value as the comparables evidence. Every row carries a seven-step farm plan with an action, a cost and a time for each step, and the dashboard (board, per-protocol detail, category filter) renders fully offline. The run is pure — no clock, no randomness, no network — so two runs write the same bytes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=14561xbg&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
