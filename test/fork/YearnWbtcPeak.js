const { expect } = require("chai")
const { BigNumber } = ethers

const deployer = require('../deployer');
const { impersonateAccount } = require('../utils')

const yvWBTCHolder = '0x5b908e3a23823fd9da157726736bacbff472976a'

let mintAndRedeemFee = BigNumber.from(10)
const PRECISION = BigNumber.from(1e4)
const ZERO = BigNumber.from(0)
const _1e18 = ethers.constants.WeiPerEther

describe('YearnWbtcPeak (mainnet-fork)', function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = '0x5b5cF8620292249669e1DCC73B753d01543D6Ac7' // DeFiDollar DAO Governance Multisig
        artifacts = await deployer.setupMainnetContracts(feeSink, 12174154)
        ;({ badgerPeak, core, bBTC } = artifacts)
        yvWBTC = await ethers.getContractAt('IyvWBTC', '0x1Ae8Ccd120A05080d9A01C3B4F627F865685D091')
    })

    it('deploy YearnWbtc Peak', async function() {
        const [ UpgradableProxy, YearnWbtcPeak ] = await Promise.all([
            ethers.getContractFactory('UpgradableProxy'),
            ethers.getContractFactory('YearnWbtcPeak')
        ])
        wbtcPeak = await UpgradableProxy.deploy()
        await wbtcPeak.updateImplementation(
            (await YearnWbtcPeak.deploy(core.address, yvWBTC.address)).address
        )
        wbtcPeak = await ethers.getContractAt('YearnWbtcPeak', wbtcPeak.address)
    })

    it('whitelist wbtc peak', async function() {
        expect(await core.peaks(wbtcPeak.address)).to.eq(0) // Extinct

        await core.whitelistPeak(wbtcPeak.address)

        expect(await core.peakAddresses(1)).to.eq(wbtcPeak.address)
        expect(await core.peaks(wbtcPeak.address)).to.eq(1) // Active
    })

    it('mint with yvWBTC', async function() {
        let amount = BigNumber.from(5).mul(1e7) // 0.5 yvWBTC
        await impersonateAccount(yvWBTCHolder)
        await yvWBTC.connect(ethers.provider.getSigner(yvWBTCHolder)).transfer(alice, amount)

        const calcMint = await wbtcPeak.calcMint(amount)
        await yvWBTC.approve(wbtcPeak.address, amount)
        await wbtcPeak.mint(amount)

        // yvWBTC.pricePerShare() = 1e8, so exact same bBTC will be minted
        let mintedBbtc = _1e18.mul(5).div(10)
        const fee = mintedBbtc.mul(mintAndRedeemFee).div(PRECISION)
        const expectedBbtc = mintedBbtc.sub(fee)

        expect(calcMint.bBTC).to.eq(expectedBbtc)
        expect(await wbtcPeak.portfolioValue()).to.eq(mintedBbtc)
        await assertions(
            wbtcPeak,
            [
                ZERO,
                expectedBbtc,
                amount,
                fee
            ]
        )
    })

    it('redeem in yvWBTC', async function() {
        let amount = await bBTC.balanceOf(alice)

        const [ calcRedeem, accumulatedFee ] = await Promise.all([
            wbtcPeak.calcRedeem(amount),
            core.accumulatedFee(),
        ])

        await wbtcPeak.redeem(amount)

        const fee = amount.mul(mintAndRedeemFee).div(PRECISION) // denominated in bbtc
        // yvWBTC.pricePerShare() = 1e8, so exact same yvWBTC will be received
        const expected = amount.sub(fee).div(BigNumber.from(1e10))

        expect(calcRedeem.sett).to.eq(expected)
        expect(calcRedeem.fee).to.eq(fee)

        await assertions(
            wbtcPeak,
            [
                expected,
                ZERO,
                fee.add(accumulatedFee).div(BigNumber.from(1e10)),
                fee.add(accumulatedFee)
            ]
        )
    })

    async function assertions(peak, [ aliceYVwbtc, alicebtc, peakYVwbtc, accumulatedFee ]) {
        const vals = await Promise.all([
            yvWBTC.balanceOf(alice),
            bBTC.balanceOf(alice),
            yvWBTC.balanceOf(peak.address),
            core.accumulatedFee()
        ])
        expect(aliceYVwbtc).to.eq(vals[0])
        expect(alicebtc).to.eq(vals[1])
        expect(peakYVwbtc).to.eq(vals[2])
        expect(accumulatedFee).to.eq(vals[3])
    }
})
