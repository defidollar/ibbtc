# Interest-bearing Badger BTC (ibBTC)

- [bBTC.sol](./contracts/bBTC.sol) is the interest-bearing bitcoin ERC20 token.

- A `peak` refers to any third party integration in the protocol. The system is designed to support many such peaks which can be added or removed later and allow for custom logic specific to the peak. [BadgerSettPeak.sol](./contracts/BadgerSettPeak.sol) let's to mint/redeem bBTC with/in Badger Sett LP tokens. There is a configurable mint and redeem fee, charged in bBTC.

- [Core.sol](./contracts/Core.sol) is responsible for actually minting/burning the bBTC tokens. `core.totalSystemAssets()` provides the summation of all LP tokens held in all peaks, denominated in bitcoin. For e.g. a Sett LP token held in BadgerSettPeak is priced as:
```
function _settToBtc(CurvePool memory pool, uint amount) internal view returns(uint) {
    return amount
        .mul(pool.sett.getPricePerFullShare())
        .mul(pool.swap.get_virtual_price())
        .div(1e36);
}
```
This has the affect that as various strategies are employed on the sett, and the underlying curve pool LP token accrues interest (from trading fee), it is reflected in `totalSystemAssets()`. Then it becomes straight-forward to price a bBTC like so:
```
function getPricePerFullShare() override public view returns (uint) {
    uint _totalSupply = IERC20(address(bBTC)).totalSupply();
    if (_totalSupply > 0) {
        return totalSystemAssets().mul(1e18).div(_totalSupply);
    }
    return 1e18;
}
```
`getPricePerFullShare()` is used to determine the bBTC:bSett exchange rate.

## Development
Needs [Alchemy](alchemyapi.io) API key. `export ALCHEMY=<API_KEY>`
```
npm run compile
npm t
npm run coverage
```

## Deployments

Local
```
npx hardhat node
npx hardhat run scripts/deploy.js --network local
```
Addresses will be written to `deployments/local.json`.

## Coverage
```
----------------------------|----------|----------|----------|----------|----------------|
File                        |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
----------------------------|----------|----------|----------|----------|----------------|
 contracts/                 |    96.25 |    55.88 |       96 |    95.12 |                |
  BadgerSettPeak.sol        |      100 |       50 |      100 |      100 |                |
  Core.sol                  |    95.83 |    57.14 |      100 |    93.88 |     70,106,125 |
  bBTC.sol                  |    83.33 |       50 |       80 |    85.71 |             33 |
 contracts/common/          |       60 |       50 |       60 |    71.43 |                |
  AccessControlDefended.sol |       60 |       50 |       60 |    71.43 |          25,29 |
 contracts/common/proxy/    |       85 |       60 |    84.62 |    88.89 |                |
  GovernableProxy.sol       |     87.5 |       75 |    83.33 |    90.91 |             35 |
  IERCProxy.sol             |      100 |      100 |      100 |      100 |                |
  Proxy.sol                 |        0 |      100 |       50 |       50 |             36 |
  UpgradableProxy.sol       |    90.91 |       50 |      100 |    92.86 |             38 |
 contracts/interfaces/      |      100 |      100 |      100 |      100 |                |
  ICore.sol                 |      100 |      100 |      100 |      100 |                |
  IPeak.sol                 |      100 |      100 |      100 |      100 |                |
  ISett.sol                 |      100 |      100 |      100 |      100 |                |
  ISwap.sol                 |      100 |      100 |      100 |      100 |                |
  IbBTC.sol                 |      100 |      100 |      100 |      100 |                |
 contracts/test/            |        0 |        0 |        0 |        0 |                |
  SaddlePeak.sol            |        0 |        0 |        0 |        0 |... 153,154,159 |
----------------------------|----------|----------|----------|----------|----------------|
All files                   |    74.05 |       54 |    73.08 |    75.35 |                |
----------------------------|----------|----------|----------|----------|----------------|
```



