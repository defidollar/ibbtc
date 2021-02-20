const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('../deployer')

const mintFeeFactor = BigNumber.from(9990)
const redeemFeeFactor = BigNumber.from(9990)
const PRECISION = BigNumber.from(10000)
const ZERO = BigNumber.from(0)
const _1e18 = ethers.constants.WeiPerEther

describe('BadgerSettPeak (fork)', function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = signers[9].address
        artifacts = await deployer.setupMainnetContracts(feeSink)
        ;({ curveBtcPeak, core, bBtc } = artifacts)
    })

    it('modifyWhitelistedCurvePools', async function() {
        const { curveBtcPeak } = artifacts
        const pools = Object.keys(deployer.crvPools).map(k => deployer.crvPools[k])
        await curveBtcPeak.modifyWhitelistedCurvePools(pools)
        expect((await curveBtcPeak.numPools()).toString()).to.eq('3')
        for (let i = 0; i < 3; i++) {
            const pool = await curveBtcPeak.pools(i)
            expect(pool.lpToken).to.eq(pools[i].lpToken)
            expect(pool.swap).to.eq(pools[i].swap)
            expect(pool.sett).to.eq(pools[i].sett)
        }
    })

    it('mint with bcrvRenWSBTC', async function() {
        let amount = _1e18.mul(10)
        await deployer.mintCrvPoolToken('sbtc', alice, amount)
        const contracts = await deployer.getPoolContracts('sbtc')
        const [ lp, _, sett ] = contracts
        await lp.approve(sett.address, amount)
        await sett.deposit(amount)
        await testMint(0, await sett.balanceOf(alice), [curveBtcPeak].concat(contracts))
    });

    it('mint with bcrvRenWBTC', async function() {
        const amount = _1e18.mul(10)
        await deployer.mintCrvPoolToken('ren', alice, amount)
        const contracts = await deployer.getPoolContracts('ren')
        const [ lp, _, sett ] = contracts
        await lp.approve(sett.address, amount)
        await sett.deposit(amount)
        await testMint(1, await sett.balanceOf(alice), [curveBtcPeak].concat(contracts))
    });

    it('mint with b-tbtc/sbtcCrv', async function() {
        const amount = _1e18.mul(10)
        await deployer.mintCrvPoolToken('tbtc', alice, amount)
        const contracts = await deployer.getPoolContracts('tbtc')
        const [ lp, _, sett ] = contracts
        await lp.approve(sett.address, amount)
        await sett.deposit(amount)
        await testMint(2, await sett.balanceOf(alice), [curveBtcPeak].concat(contracts))
    });

    it('redeem in bcrvRenWSBTC', async function() {
        await testRedeem(0, 'sbtc', _1e18.mul(5))
    });

    it('redeem in bcrvRenWBTC', async function() {
        await testRedeem(1, 'ren', _1e18.mul(5))
    });

    it('redeem in b-tbtc/sbtcCrv', async function() {
        await testRedeem(2, 'tbtc', _1e18.mul(5))
    });

    async function testRedeem(poolId, pool, amount) {
        const [ curveLPToken, swap, sett ] = await deployer.getPoolContracts(pool)
        const [ virtualPrice, pricePerFullShare, aliceBbtcBal, aliceCrvBal, peakCrvLPBal, peakSettBal, peakBbtcBal ] = await Promise.all([
            swap.get_virtual_price(),
            sett.getPricePerFullShare(),
            bBtc.balanceOf(alice),
            curveLPToken.balanceOf(alice),
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address),
        ])
        const bBtcAfterFee = amount.mul(redeemFeeFactor).div(PRECISION)
        const settToBtc = pricePerFullShare.mul(virtualPrice).div(_1e18)
        const expected = bBtcAfterFee.mul(await core.getPricePerFullShare()).div(settToBtc)

        await bBtc.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.redeem(poolId, amount)

        await assertions(
            curveBtcPeak,
            curveLPToken,
            [
                aliceCrvBal, // curveLPToken.balanceOf(alice)
                aliceBbtcBal.sub(amount), // bBtc.balanceOf(alice)
                peakCrvLPBal, // curveLPToken.balanceOf(curveBtcPeak.address)
                peakBbtcBal.add(amount.sub(bBtcAfterFee)) // bBtc.balanceOf(curveBtcPeak.address)
            ]
        )
        await settAssertions(
            curveBtcPeak,
            sett,
            [
                expected, // sett.balanceOf(alice)
                peakSettBal.sub(expected), // sett.balanceOf(peak.address)
            ]
        )
    }

    async function testMint(poolId, amount, [ peak, curveLPToken, swap, sett ]) {
        const [
            pricePerFullShare,
            bBTCpricePerFullShare,
            virtualPrice,
            aliceCrvBal,
            aliceBbtcBal,
            peakCrvLPBal,
            peakSettLPBal,
            peakBbtcBal
        ] = await Promise.all([
            sett.getPricePerFullShare(),
            core.getPricePerFullShare(),
            swap.get_virtual_price(),
            curveLPToken.balanceOf(alice),
            bBtc.balanceOf(alice),
            curveLPToken.balanceOf(peak.address),
            sett.balanceOf(peak.address),
            bBtc.balanceOf(peak.address),
        ])
        const mintedBbtc = amount
            .mul(pricePerFullShare.mul(virtualPrice).div(_1e18))
            .div(bBTCpricePerFullShare)
            .sub(1)
        const expectedBbtc = mintedBbtc.mul(mintFeeFactor).div(PRECISION)
        const fee = mintedBbtc.sub(expectedBbtc)

        await sett.approve(peak.address, amount)
        await peak.mint(poolId, amount)

        await assertions(
            peak,
            curveLPToken,
            [
                aliceCrvBal, // curveLPToken.balanceOf(alice)
                aliceBbtcBal.add(expectedBbtc), // bBtc.balanceOf(alice)
                peakCrvLPBal, // curveLPToken.balanceOf(peak.address)
                peakBbtcBal.add(fee) // bBtc.balanceOf(peak.address)
            ]
        )
        await settAssertions(
            peak,
            sett,
            [
                ZERO, // sett.balanceOf(alice)
                peakSettLPBal.add(amount), // sett.balanceOf(peak.address)
            ]
        )
    }

    async function assertions(peak, curveLPToken, [ aliceCrvLP, alicebtc, peakCrvLP, peakbtc ]) {
        const vals = await Promise.all([
            curveLPToken.balanceOf(alice),
            bBtc.balanceOf(alice),
            curveLPToken.balanceOf(peak.address),
            bBtc.balanceOf(peak.address)
        ])
        expect(aliceCrvLP).to.eq(vals[0])
        expect(alicebtc).to.eq(vals[1])
        expect(peakCrvLP).to.eq(vals[2])
        expect(peakbtc).to.eq(vals[3])
    }

    async function settAssertions(peak, sett, [ aliceSettLP, peakSettLP ]) {
        expect(aliceSettLP).to.eq(await sett.balanceOf(alice))
        expect(peakSettLP).to.eq(await sett.balanceOf(peak.address))
    }
});
