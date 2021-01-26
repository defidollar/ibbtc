const { expect, Assertion } = require("chai");
const { BigNumber } = ethers

const deployer = require('../deployer')

const mintFeeFactor = BigNumber.from(9990)
const redeemFeeFactor = BigNumber.from(9990)
const PRECISION = BigNumber.from(10000)
const ZERO = BigNumber.from(0)
const _1e18 = ethers.constants.WeiPerEther

describe.only('CurveBtcPeak', function() {
    let curveBtcPeak, core, bBtc

    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = signers[9].address
        artifacts = await deployer.setupMainnetContracts(feeSink)
        ;({ curveBtcPeak, core, bBtc } = artifacts)
    })

    it.only('modifyWhitelistedCurvePools', async function() {
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

    it.only('mint with sbtc', async function() {
        const amount = _1e18.mul(9)
        await testMintWithCurveLP(0, 'sbtc', amount)
    });

    it.only('mint with ren', async function() {
        const amount = _1e18.mul(7)
        await testMintWithCurveLP(1, 'ren', amount)
    });

    it.only('mint with tbtc', async function() {
        const amount = _1e18.mul(4)
        await testMintWithCurveLP(2, 'tbtc', amount)
    });


    it('redeemInCurveLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett, core } = artifacts

        const [ aliceSettBal, aliceBbtc, peakCrvLPBal, peakSettBal, peakBbtcBal ] = await Promise.all([
            sett.balanceOf(alice),
            bBtc.balanceOf(alice),
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address),
        ])
        const amount = aliceBbtc.div(10) // will not require a sett withdrawal
        const redeemed = amount.mul(redeemFeeFactor).div(PRECISION)
        const fee = amount.sub(redeemed)
        aliceCrvBal = redeemed
            .mul(await core.getPricePerFullShare())
            .div(virtualPrice)
        console.log('yoyo 1')
        await bBtc.approve(curveBtcPeak.address, amount)
        console.log('yoyo 2')
        await curveBtcPeak.redeemInCurveLP(0 /* poolId */, amount)
        console.log('yoyo 3')

        await assertions([
            aliceCrvBal, // curveLPToken.balanceOf(alice)
            aliceSettBal, // sett.balanceOf(alice)
            aliceBbtc.sub(amount), // bBtc.balanceOf(alice)
            peakCrvLPBal.sub(aliceCrvBal), // curveLPToken.balanceOf(curveBtcPeak.address)
            peakSettBal, // sett.balanceOf(curveBtcPeak.address)
            peakBbtcBal.add(fee) // bBtc.balanceOf(curveBtcPeak.address)
        ])
    });

    it('redeemInSettLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett, core } = artifacts
        const aliceBbtc = await bBtc.balanceOf(alice)
        const amount = aliceBbtc.mul(9).div(10)

        const [ pricePerFullShare, peakCrvLPBal, peakSettBal, peakBbtcBal ] = await Promise.all([
            sett.getPricePerFullShare(),
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address),
        ])
        const bBtcAfterFee = amount.mul(redeemFeeFactor).div(PRECISION)
        const settToBtc = pricePerFullShare.mul(virtualPrice).div(_1e18)
        const expected = bBtcAfterFee.mul(await core.getPricePerFullShare()).div(settToBtc)

        await bBtc.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.redeemInSettLP(0 /* poolId */, amount)

        await assertions([
            aliceCrvBal, // curveLPToken.balanceOf(alice)
            expected, // sett.balanceOf(alice)
            aliceBbtc.sub(amount), // bBtc.balanceOf(alice)
            peakCrvLPBal, // curveLPToken.balanceOf(curveBtcPeak.address)
            peakSettBal.sub(expected), // sett.balanceOf(curveBtcPeak.address)
            peakBbtcBal.add(amount.sub(bBtcAfterFee)) // bBtc.balanceOf(curveBtcPeak.address)
        ])
    });

    it('mintWithSettLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, swap, sett, core } = artifacts
        const amount = await sett.balanceOf(alice)

        const [ pricePerFullShare, bBTCpricePerFullShare, virtualPrice, aliceBbtcBal, peakCrvLPBal, peakSettLPBal, peakBbtcBal ] = await Promise.all([
            sett.getPricePerFullShare(),
            core.getPricePerFullShare(),
            swap.get_virtual_price(),
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
        await curveBtcPeak.mintWithSettLP(0, amount)

        await assertions([
            aliceCrvBal, // curveLPToken.balanceOf(alice)
            ZERO, // sett.balanceOf(alice)
            aliceBbtcBal.add(expectedBbtc), // bBtc.balanceOf(alice)
            peakCrvLPBal, // curveLPToken.balanceOf(curveBtcPeak.address)
            peakSettLPBal.add(amount), // sett.balanceOf(curveBtcPeak.address)
            peakBbtcBal.add(fee) // bBtc.balanceOf(curveBtcPeak.address)
        ])
    });

    async function testMintWithCurveLP(poolId, pool, amount) {
        const [ curveLPToken, swap, sett ] = await deployer.getPoolContracts(pool, curveBtcPeak.address)
        await deployer.mintCrvPoolToken(pool, alice, amount)
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

        // 10% Curve LP tokens, 90% in sett vault
        const crvLPToSett = amount.mul(9).div(10)
        const bBtcMinted = amount.mul(virtualPrice).div(pricePerFullShare).sub(1) // round-down
        const aliceBbtc = bBtcMinted.mul(mintFeeFactor).div(PRECISION) // mint fee
        await assertions(
            curveLPToken,
            sett,
            [
                ZERO, // curveLPToken.balanceOf(alice)
                ZERO, // sett.balanceOf(alice)
                aliceBbtcBal.add(aliceBbtc), // bBtc.balanceOf(alice)
                amount.div(10), // curveLPToken.balanceOf(curveBtcPeak.address)
                crvLPToSett.mul(settTotalSupply).div(_pool), // sett.balanceOf(curveBtcPeak.address)
                peakBbtcBal.add(bBtcMinted).sub(aliceBbtc) // bBtc.balanceOf(curveBtcPeak.address)
            ]
        )
        expect(crvLPToSett.add(settCrvLPBal)).to.eq(await curveLPToken.balanceOf(sett.address))
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
});

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}
