const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HealthVault", function () {
  let healthVault;
  let patient, doctor, diagnostics, researcher, unauthorized;

  beforeEach(async function () {
    // Get signers
    [patient, doctor, diagnostics, researcher, unauthorized] = await ethers.getSigners();

    // Deploy contract
    const HealthVault = await ethers.getContractFactory("HealthVault");
    healthVault = await HealthVault.deploy();
    await healthVault.waitForDeployment();

    // Assign roles
    await healthVault.connect(patient).assignRole(doctor.address, 2); // DOCTOR
    await healthVault.connect(patient).assignRole(diagnostics.address, 3); // DIAGNOSTICS
    await healthVault.connect(patient).assignRole(researcher.address, 4); // RESEARCHER
  });

  describe("Role Assignment", function () {
    it("Should assign roles correctly", async function () {
      expect(await healthVault.roles(patient.address)).to.equal(1); // PATIENT
      expect(await healthVault.roles(doctor.address)).to.equal(2); // DOCTOR
      expect(await healthVault.roles(diagnostics.address)).to.equal(3); // DIAGNOSTICS
      expect(await healthVault.roles(researcher.address)).to.equal(4); // RESEARCHER
    });

    it("Should emit RoleAssigned event", async function () {
      await expect(healthVault.connect(patient).assignRole(unauthorized.address, 1))
        .to.emit(healthVault, "RoleAssigned")
        .withArgs(unauthorized.address, 1);
    });
  });

  describe("Record Management", function () {
    const testCID = "QmTestCID1234567890";

    it("Should allow patient to add a record", async function () {
      const tx = await healthVault.connect(patient).addRecord(testCID);
      const receipt = await tx.wait();
      
      // Get the block timestamp
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      
      await expect(tx)
        .to.emit(healthVault, "RecordAdded")
        .withArgs(patient.address, testCID, block.timestamp, patient.address);

      const records = await healthVault.connect(patient).getRecords(patient.address);
      expect(records.length).to.equal(1);
      expect(records[0].cid).to.equal(testCID);
    });

    it("Should reject empty CID", async function () {
      await expect(healthVault.connect(patient).addRecord(""))
        .to.be.revertedWith("CID cannot be empty");
    });

    it("Should reject non-patient adding records", async function () {
      await expect(healthVault.connect(doctor).addRecord(testCID))
        .to.be.revertedWith("Only patients can add their own records");
    });

    it("Should return the most recent record", async function () {
      const cid1 = "QmCID1";
      const cid2 = "QmCID2";
      const cid3 = "QmCID3";

      await healthVault.connect(patient).addRecord(cid1);
      await healthVault.connect(patient).addRecord(cid2);
      await healthVault.connect(patient).addRecord(cid3);

      const mostRecent = await healthVault.connect(patient).getMostRecentRecord(patient.address);
      expect(mostRecent.cid).to.equal(cid3);
    });

    it("Should return correct record count", async function () {
      await healthVault.connect(patient).addRecord("QmCID1");
      await healthVault.connect(patient).addRecord("QmCID2");

      const count = await healthVault.connect(patient).getRecordCount(patient.address);
      expect(count).to.equal(2);
    });
  });

  describe("Doctor Access Control", function () {
    const testCID = "QmTestCID";

    beforeEach(async function () {
      await healthVault.connect(patient).addRecord(testCID);
    });

    it("Should grant doctor access", async function () {
      await expect(healthVault.connect(patient).grantDoctorAccess(doctor.address))
        .to.emit(healthVault, "AccessGranted")
        .withArgs(patient.address, doctor.address, 2);

      expect(await healthVault.hasDoctorAccess(patient.address, doctor.address)).to.be.true;
    });

    it("Should allow doctor to view records after access granted", async function () {
      await healthVault.connect(patient).grantDoctorAccess(doctor.address);

      const records = await healthVault.connect(doctor).getRecords(patient.address);
      expect(records.length).to.equal(1);
      expect(records[0].cid).to.equal(testCID);
    });

    it("Should revoke doctor access", async function () {
      await healthVault.connect(patient).grantDoctorAccess(doctor.address);
      
      await expect(healthVault.connect(patient).revokeDoctorAccess(doctor.address))
        .to.emit(healthVault, "AccessRevoked")
        .withArgs(patient.address, doctor.address, 2);

      expect(await healthVault.hasDoctorAccess(patient.address, doctor.address)).to.be.false;
    });

    it("Should prevent unauthorized doctor from viewing records", async function () {
      await expect(healthVault.connect(doctor).getRecords(patient.address))
        .to.be.revertedWith("Not authorized to view records");
    });

    it("Should reject granting access to non-doctor", async function () {
      await expect(healthVault.connect(patient).grantDoctorAccess(unauthorized.address))
        .to.be.revertedWith("Address is not a doctor");
    });
  });

  describe("Diagnostics Access Control", function () {
    const diagnosticCID = "QmDiagnosticReport123";

    it("Should grant diagnostics access", async function () {
      await expect(healthVault.connect(patient).grantDiagnosticsAccess(diagnostics.address))
        .to.emit(healthVault, "AccessGranted")
        .withArgs(patient.address, diagnostics.address, 3);

      expect(await healthVault.hasDiagnosticsAccess(patient.address, diagnostics.address)).to.be.true;
    });

    it("Should allow diagnostics to add records with permission", async function () {
      await healthVault.connect(patient).grantDiagnosticsAccess(diagnostics.address);

      const tx = await healthVault.connect(diagnostics).addDiagnosticRecord(patient.address, diagnosticCID);
      const receipt = await tx.wait();
      
      // Get the block timestamp
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      
      await expect(tx)
        .to.emit(healthVault, "RecordAdded")
        .withArgs(patient.address, diagnosticCID, block.timestamp, diagnostics.address);

      const records = await healthVault.connect(patient).getRecords(patient.address);
      expect(records[records.length - 1].cid).to.equal(diagnosticCID);
    });

    it("Should prevent diagnostics from adding records without permission", async function () {
      await expect(healthVault.connect(diagnostics).addDiagnosticRecord(patient.address, diagnosticCID))
        .to.be.revertedWith("No permission to add records for this patient");
    });

    it("Should revoke diagnostics access", async function () {
      await healthVault.connect(patient).grantDiagnosticsAccess(diagnostics.address);

      await expect(healthVault.connect(patient).revokeDiagnosticsAccess(diagnostics.address))
        .to.emit(healthVault, "AccessRevoked")
        .withArgs(patient.address, diagnostics.address, 3);

      expect(await healthVault.hasDiagnosticsAccess(patient.address, diagnostics.address)).to.be.false;
    });
  });

  describe("Researcher Access", function () {
    it("Should allow researcher to access anonymized metadata", async function () {
      const [totalRecords, uniquePatients] = await healthVault.connect(researcher).getAnonymizedMetadata();
      
      // Current implementation returns placeholder values
      expect(totalRecords).to.equal(0);
      expect(uniquePatients).to.equal(0);
    });

    it("Should reject non-researcher accessing metadata", async function () {
      await expect(healthVault.connect(patient).getAnonymizedMetadata())
        .to.be.revertedWith("Unauthorized role");
    });
  });

  describe("Authorization Edge Cases", function () {
    it("Should reject unauthorized user viewing records", async function () {
      await healthVault.connect(patient).addRecord("QmTestCID");

      await expect(healthVault.connect(unauthorized).getRecords(patient.address))
        .to.be.revertedWith("Not authorized to view records");
    });

    it("Should reject zero address for doctor access", async function () {
      await expect(healthVault.connect(patient).grantDoctorAccess(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid doctor address");
    });

    it("Should reject viewing most recent record without authorization", async function () {
      await healthVault.connect(patient).addRecord("QmTestCID");

      await expect(healthVault.connect(unauthorized).getMostRecentRecord(patient.address))
        .to.be.revertedWith("Not authorized to view records");
    });
  });
});
