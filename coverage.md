```
Core
    ✓ can't add duplicate peak
    ✓ whitelistPeak fails from non-admin account
    ✓ whitelistPeak fails for non-contract account
    ✓ setPeakStatus fails from non-admin account
    ✓ setPeakStatus (104ms)

  CurveBtcPeak
    ✓ mintWithCurveLP (170ms)
    ✓ redeemInSettLP (128ms)
    ✓ mintWithSettLP (113ms)
    ✓ redeemInCurveLP (126ms)
    ✓ collectAdminFee

  CurveBtcPeak
    ✓ modifyWhitelistedCurvePools (40ms)
    ✓ mint with crvRenWSBTC (296ms)
    ✓ mint with crvRenWBTC (496ms)
    ✓ mint with tbtc/sbtcCrv (482ms)
    ✓ redeem in crvRenWSBTC (287ms)
    ✓ redeem in crvRenWBTC (274ms)
    ✓ redeem in tbtc/sbtcCrv (259ms)
    ✓ redeem in crvRenWSBTC-sett (304ms)
    ✓ redeem in crvRenWBTC-sett (287ms)
    ✓ redeem in tbtc/sbtcCrv-sett (270ms)
    ✓ mint with crvRenWSBTC-sett (303ms)
    ✓ mint with crvRenWBTC-sett (334ms)
    ✓ mint with tbtc/sbtcCrv-sett (267ms)


  23 passing (9s)

-------------------------|----------|----------|----------|----------|----------------|
File                     |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
-------------------------|----------|----------|----------|----------|----------------|
 contracts/              |    97.83 |    55.88 |       96 |    96.81 |                |
  Core.sol               |      100 |    61.11 |      100 |     96.3 |             82 |
  CurveBtcPeak.sol       |    98.33 |       50 |      100 |    98.33 |            179 |
  bBTC.sol               |    83.33 |       50 |       80 |    85.71 |             33 |
 contracts/common/proxy/ |    65.38 |     37.5 |    68.75 |    70.59 |                |
  GovernableProxy.sol    |     87.5 |       75 |    83.33 |    90.91 |             35 |
  IERCProxy.sol          |      100 |      100 |      100 |      100 |                |
  Initializable.sol      |        0 |        0 |        0 |        0 |... 16,17,21,22 |
  Proxy.sol              |        0 |      100 |       50 |       50 |             36 |
  UpgradableProxy.sol    |    90.91 |       50 |      100 |    92.86 |             38 |
 contracts/interfaces/   |      100 |      100 |      100 |      100 |                |
  ICore.sol              |      100 |      100 |      100 |      100 |                |
  IPeak.sol              |      100 |      100 |      100 |      100 |                |
  ISett.sol              |      100 |      100 |      100 |      100 |                |
  ISwap.sol              |      100 |      100 |      100 |      100 |                |
  IbBTC.sol              |      100 |      100 |      100 |      100 |                |
-------------------------|----------|----------|----------|----------|----------------|
All files                |    90.68 |       50 |    85.37 |    89.84 |                |
-------------------------|----------|----------|----------|----------|----------------|
