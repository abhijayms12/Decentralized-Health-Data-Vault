const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HealthVault - Role-Based Access Control", function () {
  let healthVault;
  let owner, patient1, patient2, doctor, diagnostics, researcher, unauthorized;

  beforeEach(async function () {
    [owner, patient1, patient2, doctor, diagnostics, researcher, unauthorized] = await ethers.getSigners();

    const HealthVault = await ethers.getContractFactory("HealthVault");
    healthVault = await HealthVault.deploy();
    await healthVault.waitForDeployment();

    // Users self-assign roles
    await healthVault.connect(patient1).assignRole(1); // PATIENT
    await healthVault.connect(patient2).assignRole(1); // PATIENT
    await healthVault.connect(doctor).assignRole(2); // DOCTOR
    await healthVault.connect(diagnostics).assignRole(3); // DIAGNOSTICS
    await healthVault.connect(researcher).assignRole(4); // RESEARCHER
  });

  describe("Self-Assignment of Roles", function () {
    it("Should allow users to self-assign roles", async function () {
      expect(await healthVault.getRole(patient1.address)).to.equal(1); // PATIENT
      expect(await healthVault.getRole(doctor.address)).to.equal(2); // DOCTOR
      expect(await healthVault.getRole(diagnostics.address)).to.equal(3); // DIAGNOSTICS
      expect(await healthVault.getRole(researcher.address)).to.equal(4); // RESEARCHER
    });

    it("Should emit RoleAssigned event on self-assignment", async function () {
      const newUser = unauthorized;
      await expect(healthVault.connect(newUser).assignRole(1))
        .to.emit(healthVault, "RoleAssigned")
        .withArgs(newUser.address, 1);
    });

    it("Should not allow assigning NONE role", async function () {
      await expect(healthVault.connect(unauthorized).assignRole(0))
        .to.be.revertedWith("Cannot assign NONE role");
    });
  });

  describe("Patient Record Upload", function () {
    const testCID = "QmPatientCID123";

    it("Should allow patient to upload their own record", async function () {
      await expect(healthVault.connect(patient1).addPatientRecord(testCID))
        .to.emit(healthVault, "RecordAdded");
    });

    it("Should reject empty CID", async function () {
      await expect(healthVault.connect(patient1).addPatientRecord(""))
        .to.be.revertedWith("CID cannot be empty");
    });

    it("Should reject non-patient role from uploading patient record", async function () {
      await expect(healthVault.connect(doctor).addPatientRecord(testCID))
        .to.be.revertedWith("Unauthorized role");
    });
  });

  describe("Doctor Record Upload (Requires Consent)", function () {
    const doctorCID = "QmDoctorPrescription456";

    it("Should reject doctor upload without patient consent", async function () {
      await expect(healthVault.connect(doctor).addDoctorRecord(patient1.address, doctorCID))
        .to.be.revertedWith("Patient has not granted access");
    });

    it("Should allow doctor upload after patient grants access", async function () {
      await healthVault.connect(patient1).grantDoctorAccess(doctor.address);
      
      await expect(healthVault.connect(doctor).addDoctorRecord(patient1.address, doctorCID))
        .to.emit(healthVault, "RecordAdded");
    });

    it("Should reject doctor upload to non-patient address", async function () {
      await healthVault.connect(patient1).grantDoctorAccess(doctor.address);
      
      await expect(healthVault.connect(doctor).addDoctorRecord(unauthorized.address, doctorCID))
        .to.be.revertedWith("Target address is not a patient");
    });

    it("Should reject non-doctor role from using addDoctorRecord", async function () {
      await expect(healthVault.connect(patient1).addDoctorRecord(patient2.address, doctorCID))
        .to.be.revertedWith("Unauthorized role");
    });
  });

  describe("Diagnostics Record Upload (Upload-Only)", function () {
    const labCID = "QmLabResults789";

    it("Should reject diagnostics upload without patient consent", async function () {
      await expect(healthVault.connect(diagnostics).addDiagnosticRecord(patient1.address, labCID))
        .to.be.revertedWith("Patient has not granted access");
    });

    it("Should allow diagnostics upload after patient grants access", async function () {
      await healthVault.connect(patient1).grantDiagnosticsAccess(diagnostics.address);
      
      await expect(healthVault.connect(diagnostics).addDiagnosticRecord(patient1.address, labCID))
        .to.emit(healthVault, "RecordAdded");
    });

    it("Should reject diagnostics upload to non-patient address", async function () {
      await healthVault.connect(patient1).grantDiagnosticsAccess(diagnostics.address);
      
      await expect(healthVault.connect(diagnostics).addDiagnosticRecord(unauthorized.address, labCID))
        .to.be.revertedWith("Target address is not a patient");
    });
  });

  describe("Access Control - Grant and Revoke", function () {
    it("Should allow patient to grant doctor access", async function () {
      await expect(healthVault.connect(patient1).grantDoctorAccess(doctor.address))
        .to.emit(healthVault, "AccessGranted")
        .withArgs(patient1.address, doctor.address, 2);
      
      expect(await healthVault.hasDoctorAccess(patient1.address, doctor.address)).to.be.true;
    });

    it("Should allow patient to revoke doctor access", async function () {
      await healthVault.connect(patient1).grantDoctorAccess(doctor.address);
      
      await expect(healthVault.connect(patient1).revokeDoctorAccess(doctor.address))
        .to.emit(healthVault, "AccessRevoked")
        .withArgs(patient1.address, doctor.address, 2);
      
      expect(await healthVault.hasDoctorAccess(patient1.address, doctor.address)).to.be.false;
    });

    it("Should allow patient to grant diagnostics access", async function () {
      await expect(healthVault.connect(patient1).grantDiagnosticsAccess(diagnostics.address))
        .to.emit(healthVault, "AccessGranted")
        .withArgs(patient1.address, diagnostics.address, 3);
      
      expect(await healthVault.hasDiagnosticsAccess(patient1.address, diagnostics.address)).to.be.true;
    });

    it("Should allow patient to revoke diagnostics access", async function () {
      await healthVault.connect(patient1).grantDiagnosticsAccess(diagnostics.address);
      
      await expect(healthVault.connect(patient1).revokeDiagnosticsAccess(diagnostics.address))
        .to.emit(healthVault, "AccessRevoked")
        .withArgs(patient1.address, diagnostics.address, 3);
      
      expect(await healthVault.hasDiagnosticsAccess(patient1.address, diagnostics.address)).to.be.false;
    });

    it("Should reject non-patient from granting access", async function () {
      await expect(healthVault.connect(doctor).grantDoctorAccess(doctor.address))
        .to.be.revertedWith("Only patients can perform this action");
    });
  });

  describe("Record Retrieval - Authorization Checks", function () {
    beforeEach(async function () {
      await healthVault.connect(patient1).addPatientRecord("QmRecord1");
      await healthVault.connect(patient1).addPatientRecord("QmRecord2");
    });

    it("Should allow patient to view their own records", async function () {
      const records = await healthVault.connect(patient1).getRecords(patient1.address);
      expect(records.length).to.equal(2);
      expect(records[0].cid).to.equal("QmRecord1");
      expect(records[1].cid).to.equal("QmRecord2");
    });

    it("Should allow authorized doctor to view patient records", async function () {
      await healthVault.connect(patient1).grantDoctorAccess(doctor.address);
      
      const records = await healthVault.connect(doctor).getRecords(patient1.address);
      expect(records.length).to.equal(2);
    });

    it("Should reject unauthorized doctor from viewing records", async function () {
      await expect(healthVault.connect(doctor).getRecords(patient1.address))
        .to.be.revertedWith("Not authorized to view records");
    });

    it("Should BLOCK diagnostics from viewing any records", async function () {
      await healthVault.connect(patient1).grantDiagnosticsAccess(diagnostics.address);
      
      await expect(healthVault.connect(diagnostics).getRecords(patient1.address))
        .to.be.revertedWith("Diagnostics role has no read access");
    });

    it("Should reject unauthorized user from viewing records", async function () {
      await expect(healthVault.connect(unauthorized).getRecords(patient1.address))
        .to.be.revertedWith("Not authorized to view records");
    });
  });

  describe("Most Recent Record Retrieval", function () {
    beforeEach(async function () {
      await healthVault.connect(patient1).addPatientRecord("QmOld");
      await healthVault.connect(patient1).addPatientRecord("QmRecent");
    });

    it("Should return most recent record for patient", async function () {
      const record = await healthVault.connect(patient1).getMostRecentRecord(patient1.address);
      expect(record.cid).to.equal("QmRecent");
    });

    it("Should return most recent record for authorized doctor", async function () {
      await healthVault.connect(patient1).grantDoctorAccess(doctor.address);
      
      const record = await healthVault.connect(doctor).getMostRecentRecord(patient1.address);
      expect(record.cid).to.equal("QmRecent");
    });

    it("Should BLOCK diagnostics from accessing most recent record", async function () {
      await expect(healthVault.connect(diagnostics).getMostRecentRecord(patient1.address))
        .to.be.revertedWith("Diagnostics role has no read access");
    });
  });

  describe("Record Count", function () {
    it("Should return correct record count for patient", async function () {
      await healthVault.connect(patient1).addPatientRecord("QmRecord1");
      await healthVault.connect(patient1).addPatientRecord("QmRecord2");
      await healthVault.connect(patient1).addPatientRecord("QmRecord3");
      
      const count = await healthVault.connect(patient1).getRecordCount(patient1.address);
      expect(count).to.equal(3);
    });

    it("Should return correct count for authorized doctor", async function () {
      await healthVault.connect(patient1).addPatientRecord("QmRecord1");
      await healthVault.connect(patient1).grantDoctorAccess(doctor.address);
      
      const count = await healthVault.connect(doctor).getRecordCount(patient1.address);
      expect(count).to.equal(1);
    });

    it("Should BLOCK diagnostics from accessing record count", async function () {
      await expect(healthVault.connect(diagnostics).getRecordCount(patient1.address))
        .to.be.revertedWith("Diagnostics role has no read access");
    });
  });

  describe("Researcher Access (Anonymized Only)", function () {
    it("Should allow researcher to access anonymized metadata", async function () {
      const [totalRecords, uniquePatients] = await healthVault.connect(researcher).getAnonymizedMetadata();
      // Placeholder implementation returns 0, 0
      expect(totalRecords).to.equal(0);
      expect(uniquePatients).to.equal(0);
    });

    it("Should reject non-researcher from accessing metadata", async function () {
      await expect(healthVault.connect(patient1).getAnonymizedMetadata())
        .to.be.revertedWith("Unauthorized role");
    });
  });

  describe("Multi-Role Scenarios", function () {
    it("Should support a user having multiple roles across different wallets", async function () {
      // User can be patient on one wallet and doctor on another
      const wallet1 = patient1;
      const wallet2 = doctor;
      
      expect(await healthVault.getRole(wallet1.address)).to.equal(1); // PATIENT
      expect(await healthVault.getRole(wallet2.address)).to.equal(2); // DOCTOR
    });
  });

  describe("Data Ownership", function () {
    it("Should maintain patient as owner even when doctor uploads", async function () {
      await healthVault.connect(patient1).grantDoctorAccess(doctor.address);
      await healthVault.connect(doctor).addDoctorRecord(patient1.address, "QmDoctorNote");
      
      // Record is stored under patient's address
      const records = await healthVault.connect(patient1).getRecords(patient1.address);
      expect(records.length).to.equal(1);
      expect(records[0].uploader).to.equal(doctor.address);
      
      // Patient can still revoke access
      await healthVault.connect(patient1).revokeDoctorAccess(doctor.address);
      await expect(healthVault.connect(doctor).getRecords(patient1.address))
        .to.be.revertedWith("Not authorized to view records");
    });
  });
});
