const { expect } = require("chai");

const deployer = require('./deployer')

describe('Core', function() {
    let badgerPeak, core

    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = signers[9].address
        dummyPeak = signers[8]
        artifacts = await deployer.setupContracts(feeSink)
        ;({ badgerPeak, bBtc, core } = artifacts)
    })

    it('can\'t add duplicate peak', async function() {
        try {
            await core.whitelistPeak(badgerPeak.address)
        }  catch (e) {
            expect(e.message).to.eq('VM Exception while processing transaction: revert DUPLICATE_PEAK')
        }
    })

    it('whitelistPeak fails from non-admin account', async function() {
        try {
            await core.connect(signers[1]).whitelistPeak(signers[8].address)
        } catch (e) {
            expect(e.message).to.eq('VM Exception while processing transaction: revert NOT_OWNER')
        }
    });

    it('whitelistPeak fails for non-contract account', async function() {
        try {
            await core.whitelistPeak(dummyPeak.address)
        }  catch (e) {
            expect(e.message).to.eq('Transaction reverted: function call to a non-contract account')
        }
    })

    it('setPeakStatus fails from non-admin account', async function() {
        try {
            await core.connect(signers[1]).setPeakStatus(badgerPeak.address, 2 /* Dormant */)
        } catch (e) {
            expect(e.message).to.eq('VM Exception while processing transaction: revert NOT_OWNER')
        }
    });

    it('setPeakStatus', async function() {
        expect(await core.peaks(badgerPeak.address)).to.eq(1)
        await core.setPeakStatus(badgerPeak.address, 1 /* Active */)
        expect(await core.peaks(badgerPeak.address)).to.eq(1)
        await core.setPeakStatus(badgerPeak.address, 2 /* Dormant */)
        expect(await core.peaks(badgerPeak.address)).to.eq(2)
        await core.setPeakStatus(badgerPeak.address, 0 /* Extinct */)
        expect(await core.peaks(badgerPeak.address)).to.eq(0)
    })

    it('mint fails from unwhitelisted peak', async function() {
        try {
            await core.mint(1, alice)
        } catch (e) {
            expect(e.message).to.eq('VM Exception while processing transaction: revert PEAK_INACTIVE')
        }
    })

    it('redeem fails from unwhitelisted peak', async function() {
        try {
            await core.redeem(1, alice)
        } catch (e) {
            expect(e.message).to.eq('VM Exception while processing transaction: revert PEAK_EXTINCT')
        }
    })
})
