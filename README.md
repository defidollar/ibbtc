# Badger BTC (bBTC)

## Development
Needs [Alchemy](alchemyapi.io) API key. `export ALCHEMY=<API_KEY>`
```
npm run compile
npm t
npm run coverage
```

## Notes

- [bBTC.sol](./contracts/bBTC.sol) is the interest-bearing bitcoin ERC20 token.

- A `peak` refers to any third party integration in the protocol. The system is designed to support many such peaks which can be added or removed later and allow for custom logic specific to the peak. [CurveBtcPeak.sol](./contracts/CurveBtcPeak.sol) let's to mint/redeem bBTC with/in Badger Sett LP tokens. There is a configurable mint and redeem fee, charged in bBTC.

- [Core.sol](./contracts/Core.sol) is responsible for actually minting/burning the bBTC tokens. `core.totalSystemAssets()` provides the summation of all LP tokens held in all peaks, denominated in bitcoin. For e.g. a Sett LP token held in CurveBtcPeak is priced as:
```
function settToBtc(ISwap swap, ISett sett) public view returns (uint) {
    return sett.getPricePerFullShare().mul(swap.get_virtual_price()).div(1e18);
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



