const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('../deployer')

const mintAndRedeemFee = BigNumber.from(10)
const PRECISION = BigNumber.from(10000)
const ZERO = BigNumber.from(0)
const _1e18 = ethers.constants.WeiPerEther

const saddle = {
    lpToken: '0xC28DF698475dEC994BE00C9C9D8658A548e6304F', // saddleTWRenSBTC
    swap: '0x4f6A43Ad7cba042606dECaCA730d4CE0A57ac62e'
}
const saddleTWRenSBTCWhale = '0xffd4dae0d7d8ddb6f408dca0a47763ae3a57f4ce'

describe('BadgerSettPeak + SaddlePeak (fork)', function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = signers[9].address
        artifacts = await deployer.setupMainnetContracts(feeSink)
        ;({ badgerPeak, core, bBTC } = artifacts)
    })

    it('saddlePeak.modifyWhitelistedCurvePools', async function() {
        const [ UpgradableProxy, SaddlePeak] = await Promise.all([
            ethers.getContractFactory('UpgradableProxy'),
            ethers.getContractFactory('SaddlePeak')
        ])
        saddlePeak = await UpgradableProxy.deploy()
        await saddlePeak.updateImplementation(
            (await SaddlePeak.deploy(core.address)).address
        )
        ;([ saddlePeak, saddleTWRenSBTC, saddleSwap ] = await Promise.all([
            ethers.getContractAt('SaddlePeak', saddlePeak.address),
            ethers.getContractAt('CurveLPToken', saddle.lpToken),
            ethers.getContractAt('ISaddleSwap', saddle.swap)
        ]))
        const pools = [saddle]
        await saddlePeak.modifyWhitelistedCurvePools(pools)
        expect((await saddlePeak.numPools()).toString()).to.eq('1')
        const pool = await saddlePeak.pools(0)
        expect(pool.lpToken).to.eq(pool.lpToken)
        expect(pool.swap).to.eq(pool.swap)
    })

    it('whitelist saddle peak', async function() {
        await core.whitelistPeak(saddlePeak.address)
    })

    it('badgerPeak.modifyWhitelistedCurvePools', async function() {
        const pools = Object.keys(deployer.crvPools).map(k => deployer.crvPools[k])
        await badgerPeak.modifyWhitelistedCurvePools(pools)
        expect((await badgerPeak.numPools()).toString()).to.eq('3')
        for (let i = 0; i < 3; i++) {
            const pool = await badgerPeak.pools(i)
            expect(pool.lpToken).to.eq(pools[i].lpToken)
            expect(pool.swap).to.eq(pools[i].swap)
            expect(pool.sett).to.eq(pools[i].sett)
        }
    })

    it('mint with saddleTWRenSBTC', async function() {
        let amount = BigNumber.from(9).mul(BigNumber.from(10).pow(17)) // 0.9
        await deployer.impersonateAccount(saddleTWRenSBTCWhale)
        // transfer from whale
        await saddleTWRenSBTC.connect(ethers.provider.getSigner(saddleTWRenSBTCWhale)).transfer(alice, amount)
        await testMintWithCurveLP(0, amount, [ saddlePeak, saddleTWRenSBTC, saddleSwap ])
        bbtcMintedFromSaddle = await bBTC.balanceOf(alice)
    });

    it('mint with bcrvRenWSBTC', async function() {
        let amount = _1e18.mul(10)
        await deployer.mintCrvPoolToken('sbtc', alice, amount)
        const contracts = await deployer.getPoolContracts('sbtc')
        const [ lp, _, sett ] = contracts
        await lp.approve(sett.address, amount)
        await sett.deposit(amount)
        await testMint(0, await sett.balanceOf(alice), [badgerPeak].concat(contracts))
    });

    it('mint with bcrvRenWBTC', async function() {
        const amount = _1e18.mul(10)
        await deployer.mintCrvPoolToken('ren', alice, amount)
        const contracts = await deployer.getPoolContracts('ren')
        const [ lp, _, sett ] = contracts
        await lp.approve(sett.address, amount)
        await sett.deposit(amount)
        await testMint(1, await sett.balanceOf(alice), [badgerPeak].concat(contracts))
    });

    it('mint with b-tbtc/sbtcCrv', async function() {
        const amount = _1e18.mul(10)
        await deployer.mintCrvPoolToken('tbtc', alice, amount)
        const contracts = await deployer.getPoolContracts('tbtc')
        const [ lp, _, sett ] = contracts
        await lp.approve(sett.address, amount)
        await sett.deposit(amount)
        await testMint(2, await sett.balanceOf(alice), [badgerPeak].concat(contracts))
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

    it('redeem in saddleTWRenSBTC', async function() {
        await testRedeemInCurveLP(0, bbtcMintedFromSaddle, [ saddlePeak, saddleTWRenSBTC, saddleSwap ])
    });

    async function testMintWithCurveLP(poolId, amount, [ peak, curveLPToken, swap ]) {
        const [ virtualPrice, pricePerFullShare, aliceBbtcBal, accumulatedFee ] = await Promise.all([
            swap.getVirtualPrice(),
            core.getPricePerFullShare(),
            bBTC.balanceOf(alice),
            core.accumulatedFee()
        ])

        await curveLPToken.approve(peak.address, amount)
        await peak.mint(poolId, amount)

        const bBTCMinted = amount.mul(virtualPrice).div(pricePerFullShare).sub(1) // round-down
        const fee = bBTCMinted.mul(mintAndRedeemFee).div(PRECISION)
        const aliceBbtc = bBTCMinted.sub(fee)
        await assertions(
            saddlePeak,
            curveLPToken,
            [
                ZERO, // curveLPToken.balanceOf(alice)
                aliceBbtcBal.add(aliceBbtc), // bBTC.balanceOf(alice)
                amount, // curveLPToken.balanceOf(peak.address)
                accumulatedFee.add(fee)
            ]
        )
    }

    async function testRedeemInCurveLP(poolId, amount, [ peak, curveLPToken, swap ]) {
        const [ virtualPrice, aliceBbtc, peakCrvLPBal, accumulatedFee ] = await Promise.all([
            swap.getVirtualPrice(),
            bBTC.balanceOf(alice),
            curveLPToken.balanceOf(peak.address),
            core.accumulatedFee(),
        ])
        const fee = amount.mul(mintAndRedeemFee).div(PRECISION)
        aliceCrvBal = amount.sub(fee)
            .mul(await core.getPricePerFullShare())
            .div(virtualPrice)
        await peak.redeem(poolId, amount)

        await assertions(
            peak,
            curveLPToken,
            [
                aliceCrvBal, // curveLPToken.balanceOf(alice)
                aliceBbtc.sub(amount), // bBTC.balanceOf(alice)
                peakCrvLPBal.sub(aliceCrvBal), // curveLPToken.balanceOf(badgerPeak.address)
                accumulatedFee.add(fee) // core.accumulatedFee()
            ]
        )
    }

    async function testRedeem(poolId, pool, amount) {
        const [ curveLPToken, swap, sett ] = await deployer.getPoolContracts(pool)
        const [ virtualPrice, pricePerFullShare, aliceBbtcBal, aliceCrvBal, peakCrvLPBal, peakSettBal, accumulatedFee ] = await Promise.all([
            swap.get_virtual_price(),
            sett.getPricePerFullShare(),
            bBTC.balanceOf(alice),
            curveLPToken.balanceOf(alice),
            curveLPToken.balanceOf(badgerPeak.address),
            sett.balanceOf(badgerPeak.address),
            core.accumulatedFee(),
        ])
        const fee = amount.mul(mintAndRedeemFee).div(PRECISION)
        const settToBtc = pricePerFullShare.mul(virtualPrice).div(_1e18)
        const expected = amount.sub(fee).mul(await core.getPricePerFullShare()).div(settToBtc)

        await badgerPeak.redeem(poolId, amount)

        await assertions(
            badgerPeak,
            curveLPToken,
            [
                aliceCrvBal, // curveLPToken.balanceOf(alice)
                aliceBbtcBal.sub(amount), // bBTC.balanceOf(alice)
                peakCrvLPBal, // curveLPToken.balanceOf(badgerPeak.address)
                accumulatedFee.add(fee) // core.accumulatedFee()
            ]
        )
        await settAssertions(
            badgerPeak,
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
            accumulatedFee
        ] = await Promise.all([
            sett.getPricePerFullShare(),
            core.getPricePerFullShare(),
            swap.get_virtual_price(),
            curveLPToken.balanceOf(alice),
            bBTC.balanceOf(alice),
            curveLPToken.balanceOf(peak.address),
            sett.balanceOf(peak.address),
            core.accumulatedFee(),
        ])
        const mintedBbtc = amount
            .mul(pricePerFullShare)
            .div(_1e18)
            .mul(virtualPrice)
            .div(bBTCpricePerFullShare)
            .sub(1)
        const fee = mintedBbtc.mul(mintAndRedeemFee).div(PRECISION)
        const expectedBbtc = mintedBbtc.sub(fee)
        await sett.approve(peak.address, amount)
        await peak.mint(poolId, amount)
        await assertions(
            peak,
            curveLPToken,
            [
                aliceCrvBal, // curveLPToken.balanceOf(alice)
                aliceBbtcBal.add(expectedBbtc), // bBTC.balanceOf(alice)
                peakCrvLPBal, // curveLPToken.balanceOf(peak.address)
                accumulatedFee.add(fee) // core.accumulatedFee()
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

    async function assertions(peak, curveLPToken, [ aliceCrvLP, alicebtc, peakCrvLP, accumulatedFee ]) {
        const vals = await Promise.all([
            curveLPToken.balanceOf(alice),
            bBTC.balanceOf(alice),
            curveLPToken.balanceOf(peak.address),
            core.accumulatedFee()
        ])
        expect(aliceCrvLP).to.eq(vals[0])
        expect(alicebtc).to.eq(vals[1])
        expect(peakCrvLP).to.eq(vals[2])
        expect(accumulatedFee).to.eq(vals[3])
    }

    async function settAssertions(peak, sett, [ aliceSettLP, peakSettLP ]) {
        expect(aliceSettLP).to.eq(await sett.balanceOf(alice))
        expect(peakSettLP).to.eq(await sett.balanceOf(peak.address))
    }
});
