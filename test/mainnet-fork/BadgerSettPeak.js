const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('../deployer')

const balanceRatio = 6 // 60% Curve LP tokens, 40% in sett vault
const mintFeeFactor = BigNumber.from(9990)
const redeemFeeFactor = BigNumber.from(9990)
const PRECISION = BigNumber.from(10000)
const ZERO = BigNumber.from(0)
const _1e18 = ethers.constants.WeiPerEther

describe('BadgerSettPeak (fork)', function() {
    let curveBtcPeak, core, bBtc, crvPools = {}

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
        await testMint(0, await sett.balanceOf(alice), contracts)

    });

    it('mint with bcrvRenWBTC', async function() {
        const amount = _1e18.mul(10)
        await deployer.mintCrvPoolToken('ren', alice, amount)
        const contracts = await deployer.getPoolContracts('ren')
        const [ lp, _, sett ] = contracts
        await lp.approve(sett.address, amount)
        await sett.deposit(amount)
        await testMint(1, await sett.balanceOf(alice), contracts)
    });

    it('mint with b-tbtc/sbtcCrv', async function() {
        const amount = _1e18.mul(10)
        await deployer.mintCrvPoolToken('tbtc', alice, amount)
        const contracts = await deployer.getPoolContracts('tbtc')
        const [ lp, _, sett ] = contracts
        await lp.approve(sett.address, amount)
        await sett.deposit(amount)
        await testMint(2, await sett.balanceOf(alice), contracts)
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

    async function testMintWithCurveLP(poolId, amount, [ curveLPToken, swap, sett ]) {
        const [ virtualPrice, _pool, settTotalSupply, pricePerFullShare, settCrvLPBal, aliceBbtcBal, peakBbtcBal ] = await Promise.all([
            swap.get_virtual_price(),
            sett.balance(),
            sett.totalSupply(),
            core.getPricePerFullShare(),
            curveLPToken.balanceOf(sett.address),
            bBtc.balanceOf(alice),
            bBtc.balanceOf(curveBtcPeak.address)
        ])

        await curveLPToken.approve(artifacts.curveBtcPeak.address, amount)
        await curveBtcPeak.mintWithCurveLP(poolId, amount)

        const crvLPInPeak = amount.mul(balanceRatio).div(10)
        const crvLPToSett = amount.sub(crvLPInPeak)
        const bBtcMinted = amount.mul(virtualPrice).div(pricePerFullShare).sub(1) // round-down
        const aliceBbtc = bBtcMinted.mul(mintFeeFactor).div(PRECISION) // mint fee
        await assertions(
            curveLPToken,
            sett,
            [
                ZERO, // curveLPToken.balanceOf(alice)
                ZERO, // sett.balanceOf(alice)
                aliceBbtcBal.add(aliceBbtc), // bBtc.balanceOf(alice)
                crvLPInPeak, // curveLPToken.balanceOf(curveBtcPeak.address)
                crvLPToSett.mul(settTotalSupply).div(_pool), // sett.balanceOf(curveBtcPeak.address)
                peakBbtcBal.add(bBtcMinted).sub(aliceBbtc) // bBtc.balanceOf(curveBtcPeak.address)
            ]
        )
        expect(crvLPToSett.add(settCrvLPBal)).to.eq(await curveLPToken.balanceOf(sett.address))
    }

    async function testRedeemInCurveLP(poolId, pool, amount) {
        const [ curveLPToken, swap, sett ] = await deployer.getPoolContracts(pool)
        const [ virtualPrice, aliceSettBal, aliceBbtc, peakCrvLPBal, peakSettBal, peakBbtcBal ] = await Promise.all([
            swap.get_virtual_price(),
            sett.balanceOf(alice),
            bBtc.balanceOf(alice),
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address),
        ])
        const redeemed = amount.mul(redeemFeeFactor).div(PRECISION)
        const fee = amount.sub(redeemed)
        aliceCrvBal = redeemed
            .mul(await core.getPricePerFullShare())
            .div(virtualPrice)
        await bBtc.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.redeemInCurveLP(poolId, amount)

        await assertions(
            curveLPToken,
            sett,
            [
                aliceCrvBal, // curveLPToken.balanceOf(alice)
                aliceSettBal, // sett.balanceOf(alice)
                aliceBbtc.sub(amount), // bBtc.balanceOf(alice)
                peakCrvLPBal.sub(aliceCrvBal), // curveLPToken.balanceOf(curveBtcPeak.address)
                peakSettBal, // sett.balanceOf(curveBtcPeak.address)
                peakBbtcBal.add(fee) // bBtc.balanceOf(curveBtcPeak.address)
            ]
        )
    }

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
            curveLPToken,
            sett,
            [
                aliceCrvBal, // curveLPToken.balanceOf(alice)
                expected, // sett.balanceOf(alice)
                aliceBbtcBal.sub(amount), // bBtc.balanceOf(alice)
                peakCrvLPBal, // curveLPToken.balanceOf(curveBtcPeak.address)
                peakSettBal.sub(expected), // sett.balanceOf(curveBtcPeak.address)
                peakBbtcBal.add(amount.sub(bBtcAfterFee)) // bBtc.balanceOf(curveBtcPeak.address)
            ]
        )
    }

    async function testMint(poolId, amount, [ curveLPToken, swap, sett ]) {
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
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address),
        ])
        const mintedBbtc = amount
            .mul(pricePerFullShare.mul(virtualPrice).div(_1e18))
            .div(bBTCpricePerFullShare)
            .sub(1)
        const expectedBbtc = mintedBbtc.mul(mintFeeFactor).div(PRECISION)
        const fee = mintedBbtc.sub(expectedBbtc)

        await sett.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.mint(poolId, amount)

        await assertions(
            curveLPToken,
            sett,
            [
                aliceCrvBal, // curveLPToken.balanceOf(alice)
                ZERO, // sett.balanceOf(alice)
                aliceBbtcBal.add(expectedBbtc), // bBtc.balanceOf(alice)
                peakCrvLPBal, // curveLPToken.balanceOf(curveBtcPeak.address)
                peakSettLPBal.add(amount), // sett.balanceOf(curveBtcPeak.address)
                peakBbtcBal.add(fee) // bBtc.balanceOf(curveBtcPeak.address)
            ]
        )
    }

    async function assertions(curveLPToken, sett, [ aliceCrvLP, aliceSettLP, alicebtc, peakCrvLP, peakSettLP, peakbtc ]) {
        const vals = await Promise.all([
            curveLPToken.balanceOf(alice),
            sett.balanceOf(alice),
            bBtc.balanceOf(alice),
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address)
        ])
        expect(aliceCrvLP).to.eq(vals[0])
        expect(aliceSettLP).to.eq(vals[1])
        expect(alicebtc).to.eq(vals[2])
        expect(peakCrvLP).to.eq(vals[3])
        expect(peakSettLP).to.eq(vals[4])
        expect(peakbtc).to.eq(vals[5])
    }

    async function getCrvPoolContracts(pool) {
        if (!crvPools[pool]) {
            crvPools[pool] = await deployer.getPoolContracts(pool, curveBtcPeak.address)
        }
        return crvPools[pool]
    }
});

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}
