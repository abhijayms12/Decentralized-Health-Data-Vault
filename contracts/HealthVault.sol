// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HealthVault
 * @dev Decentralized health data vault storing only IPFS CIDs and permissions
 * RULES:
 * - Store ONLY CIDs, timestamps, and access permissions
 * - Do NOT store personal or medical data on-chain
 */
contract HealthVault {
    // Roles
    enum Role { NONE, PATIENT, DOCTOR, DIAGNOSTICS, RESEARCHER }
    
    // Record structure
    struct Record {
        string cid;
        uint256 timestamp;
        address uploader;
        string filename;
    }
    
    // Role assignment
    mapping(address => Role) public roles;
    
    // Patient records: patient address => array of records
    mapping(address => Record[]) private patientRecords;
    
    // Access control: patient => doctor => hasAccess
    mapping(address => mapping(address => bool)) private doctorAccess;
    
    // Diagnostics access: patient => diagnostics lab => hasAccess
    mapping(address => mapping(address => bool)) private diagnosticsAccess;
    
    // =====================================================
    // UserID System: Hash-based deterministic user IDs
    // Format: ROLE-HASH (e.g., PAT-9F3C8A2D)
    // Hash = first 8 hex chars of keccak256(rolePrefix, address)
    // =====================================================
    
    // UserID hash => address mapping (for resolution)
    mapping(bytes32 => address) private userIdHashToAddress;
    
    // Address => UserID hash mapping (for lookup)
    mapping(address => bytes32) private addressToUserIdHash;
    
    // Short UserID hash (4 bytes) => address mapping (for quick resolution)
    mapping(bytes4 => address) private shortUserIdToAddress;
    
    // Events for all permission changes
    event RecordAdded(address indexed patient, string cid, uint256 timestamp, address indexed uploader);
    event AccessGranted(address indexed patient, address indexed accessor, Role role);
    event AccessRevoked(address indexed patient, address indexed accessor, Role role);
    event RoleAssigned(address indexed user, Role role);
    event UserIdRegistered(address indexed user, bytes32 indexed userIdHash, Role role);
    
    // Modifiers
    modifier onlyRole(Role _role) {
        require(roles[msg.sender] == _role, "Unauthorized role");
        _;
    }
    
    modifier onlyPatient() {
        require(roles[msg.sender] == Role.PATIENT, "Only patients can perform this action");
        _;
    }
    
    constructor() {
        // Contract deployer can assign roles initially
        roles[msg.sender] = Role.PATIENT;
        emit RoleAssigned(msg.sender, Role.PATIENT);
    }
    
    /**
     * @dev Assign a role to an address
     * Users can self-assign roles (wallet = identity)
     * @param _role Role to assign to caller
     */
    function assignRole(Role _role) external {
        require(_role != Role.NONE, "Cannot assign NONE role");
        roles[msg.sender] = _role;
        emit RoleAssigned(msg.sender, _role);
    }
    
    /**
     * @dev Get the role of any address
     * @param _user Address to check
     * @return Role of the user
     */
    function getRole(address _user) external view returns (Role) {
        return roles[_user];
    }
    
    /**
     * @dev Patient adds their own health record (CID only)
     * @param _cid IPFS CID of the encrypted health document
     * @param _filename Original filename of the uploaded document
     */
    function addPatientRecord(string memory _cid, string memory _filename) external onlyRole(Role.PATIENT) {
        require(bytes(_cid).length > 0, "CID cannot be empty");
        
        Record memory newRecord = Record({
            cid: _cid,
            timestamp: block.timestamp,
            uploader: msg.sender,
            filename: _filename
        });
        
        patientRecords[msg.sender].push(newRecord);
        emit RecordAdded(msg.sender, _cid, block.timestamp, msg.sender);
    }
    
    /**
     * @dev Doctor adds a record for a patient (requires patient consent)
     * @param _patient Patient address
     * @param _cid IPFS CID of the medical document (prescription, diagnosis, treatment notes)
     * @param _filename Original filename of the uploaded document
     */
    function addDoctorRecord(address _patient, string memory _cid, string memory _filename) external onlyRole(Role.DOCTOR) {
        require(bytes(_cid).length > 0, "CID cannot be empty");
        require(_patient != address(0), "Invalid patient address");
        require(roles[_patient] == Role.PATIENT, "Target address is not a patient");
        require(doctorAccess[_patient][msg.sender], "Patient has not granted access");
        
        Record memory newRecord = Record({
            cid: _cid,
            timestamp: block.timestamp,
            uploader: msg.sender,
            filename: _filename
        });
        
        patientRecords[_patient].push(newRecord);
        emit RecordAdded(_patient, _cid, block.timestamp, msg.sender);
    }
    
    /**
     * @dev Diagnostics lab adds a record for a patient (UPLOAD-ONLY, NO READ ACCESS)
     * @param _patient Patient address
     * @param _cid IPFS CID of the diagnostic report (lab results, test results)
     * @param _filename Original filename of the uploaded document
     */
    function addDiagnosticRecord(address _patient, string memory _cid, string memory _filename) external onlyRole(Role.DIAGNOSTICS) {
        require(bytes(_cid).length > 0, "CID cannot be empty");
        require(_patient != address(0), "Invalid patient address");
        require(roles[_patient] == Role.PATIENT, "Target address is not a patient");
        require(diagnosticsAccess[_patient][msg.sender], "Patient has not granted access");
        
        Record memory newRecord = Record({
            cid: _cid,
            timestamp: block.timestamp,
            uploader: msg.sender,
            filename: _filename
        });
        
        patientRecords[_patient].push(newRecord);
        emit RecordAdded(_patient, _cid, block.timestamp, msg.sender);
    }
    
    /**
     * @dev Grant doctor access to patient records
     * @param _doctor Doctor's address
     */
    function grantDoctorAccess(address _doctor) external onlyPatient {
        require(_doctor != address(0), "Invalid doctor address");
        require(roles[_doctor] == Role.DOCTOR, "Address is not a doctor");
        
        doctorAccess[msg.sender][_doctor] = true;
        emit AccessGranted(msg.sender, _doctor, Role.DOCTOR);
    }
    
    /**
     * @dev Revoke doctor access to patient records
     * @param _doctor Doctor's address
     */
    function revokeDoctorAccess(address _doctor) external onlyPatient {
        require(_doctor != address(0), "Invalid doctor address");
        
        doctorAccess[msg.sender][_doctor] = false;
        emit AccessRevoked(msg.sender, _doctor, Role.DOCTOR);
    }
    
    /**
     * @dev Grant diagnostics lab permission to add records
     * @param _diagnostics Diagnostics lab address
     */
    function grantDiagnosticsAccess(address _diagnostics) external onlyPatient {
        require(_diagnostics != address(0), "Invalid diagnostics address");
        require(roles[_diagnostics] == Role.DIAGNOSTICS, "Address is not a diagnostics lab");
        
        diagnosticsAccess[msg.sender][_diagnostics] = true;
        emit AccessGranted(msg.sender, _diagnostics, Role.DIAGNOSTICS);
    }
    
    /**
     * @dev Revoke diagnostics lab permission
     * @param _diagnostics Diagnostics lab address
     */
    function revokeDiagnosticsAccess(address _diagnostics) external onlyPatient {
        require(_diagnostics != address(0), "Invalid diagnostics address");
        
        diagnosticsAccess[msg.sender][_diagnostics] = false;
        emit AccessRevoked(msg.sender, _diagnostics, Role.DIAGNOSTICS);
    }
    
    /**
     * @dev Get all records for a patient (only if authorized)
     * DIAGNOSTICS ROLE CANNOT ACCESS THIS FUNCTION
     * @param _patient Patient's address
     * @return Array of records
     */
    function getRecords(address _patient) external view returns (Record[] memory) {
        require(_patient != address(0), "Invalid patient address");
        require(roles[msg.sender] != Role.DIAGNOSTICS, "Diagnostics role has no read access");
        
        // Patient can view own records
        if (msg.sender == _patient && roles[msg.sender] == Role.PATIENT) {
            return patientRecords[_patient];
        }
        
        // Doctor can view if granted access
        if (roles[msg.sender] == Role.DOCTOR && doctorAccess[_patient][msg.sender]) {
            return patientRecords[_patient];
        }
        
        revert("Not authorized to view records");
    }
    
    /**
     * @dev Get the most recent record for a patient
     * DIAGNOSTICS ROLE CANNOT ACCESS THIS FUNCTION
     * @param _patient Patient's address
     * @return Most recent record
     */
    function getMostRecentRecord(address _patient) external view returns (Record memory) {
        require(_patient != address(0), "Invalid patient address");
        require(roles[msg.sender] != Role.DIAGNOSTICS, "Diagnostics role has no read access");
        
        // Authorization check
        require(
            (msg.sender == _patient && roles[msg.sender] == Role.PATIENT) || 
            (roles[msg.sender] == Role.DOCTOR && doctorAccess[_patient][msg.sender]),
            "Not authorized to view records"
        );
        
        Record[] memory records = patientRecords[_patient];
        require(records.length > 0, "No records found");
        
        return records[records.length - 1];
    }
    
    /**
     * @dev Get record count for a patient (accessible by patient or authorized doctor)
     * DIAGNOSTICS ROLE CANNOT ACCESS THIS FUNCTION
     * @param _patient Patient's address
     * @return Number of records
     */
    function getRecordCount(address _patient) external view returns (uint256) {
        require(_patient != address(0), "Invalid patient address");
        require(roles[msg.sender] != Role.DIAGNOSTICS, "Diagnostics role has no read access");
        
        // Authorization check
        require(
            (msg.sender == _patient && roles[msg.sender] == Role.PATIENT) || 
            (roles[msg.sender] == Role.DOCTOR && doctorAccess[_patient][msg.sender]),
            "Not authorized to view record count"
        );
        
        return patientRecords[_patient].length;
    }
    
    /**
     * @dev Get anonymized metadata for researchers (no CIDs or addresses)
     * @return totalRecords Total number of records across all patients
     * @return uniquePatients Number of patients with at least one record
     */
    function getAnonymizedMetadata() external view onlyRole(Role.RESEARCHER) returns (uint256 totalRecords, uint256 uniquePatients) {
        // Note: This is a simplified implementation
        // In production, you would need to track these metrics more efficiently
        // This function is meant to demonstrate the concept of researcher access
        // without exposing sensitive data
        
        // For now, returning placeholder values
        // A more complete implementation would require additional state variables
        return (0, 0);
    }
    
    /**
     * @dev Check if a doctor has access to a patient's records
     * @param _patient Patient's address
     * @param _doctor Doctor's address
     * @return True if doctor has access
     */
    function hasDoctorAccess(address _patient, address _doctor) external view returns (bool) {
        return doctorAccess[_patient][_doctor];
    }
    
    /**
     * @dev Check if a diagnostics lab has access to add records for a patient
     * @param _patient Patient's address
     * @param _diagnostics Diagnostics lab address
     * @return True if diagnostics lab has access
     */
    function hasDiagnosticsAccess(address _patient, address _diagnostics) external view returns (bool) {
        return diagnosticsAccess[_patient][_diagnostics];
    }
    
    // =====================================================
    // UserID Registration & Resolution Functions
    // =====================================================
    
    /**
     * @dev Register a UserID for the caller
     * UserID hash = keccak256(rolePrefix, msg.sender)
     * Can only be called once per address
     */
    function registerUserId() external {
        require(roles[msg.sender] != Role.NONE, "Must have a role assigned first");
        require(addressToUserIdHash[msg.sender] == bytes32(0), "UserID already registered");
        
        // Get role prefix string
        string memory rolePrefix;
        if (roles[msg.sender] == Role.PATIENT) {
            rolePrefix = "PAT";
        } else if (roles[msg.sender] == Role.DOCTOR) {
            rolePrefix = "DOC";
        } else if (roles[msg.sender] == Role.DIAGNOSTICS) {
            rolePrefix = "DIA";
        } else if (roles[msg.sender] == Role.RESEARCHER) {
            rolePrefix = "RES";
        } else {
            revert("Invalid role for UserID registration");
        }
        
        // Compute UserID hash: keccak256(rolePrefix, address)
        bytes32 userIdHash = keccak256(abi.encodePacked(rolePrefix, msg.sender));
        
        // Extract first 4 bytes (8 hex characters) for short hash
        bytes4 shortHash = bytes4(userIdHash);
        
        // Collision check (extremely unlikely with 256-bit hash)
        require(userIdHashToAddress[userIdHash] == address(0), "UserID hash collision detected");
        
        // Check short hash collision (more likely, but still rare with 4 bytes)
        if (shortUserIdToAddress[shortHash] != address(0)) {
            // Short hash collision - this is acceptable since we have the full hash
            // But we won't be able to resolve using short hash alone
            shortHash = bytes4(0); // Set to zero to indicate collision
        }
        
        // Store mappings
        userIdHashToAddress[userIdHash] = msg.sender;
        addressToUserIdHash[msg.sender] = userIdHash;
        if (shortHash != bytes4(0)) {
            shortUserIdToAddress[shortHash] = msg.sender;
        }
        
        emit UserIdRegistered(msg.sender, userIdHash, roles[msg.sender]);
    }
    
    /**
     * @dev Get the UserID hash for an address
     * @param _user Address to look up
     * @return UserID hash (bytes32), or zero if not registered
     */
    function getUserIdHash(address _user) external view returns (bytes32) {
        return addressToUserIdHash[_user];
    }
    
    /**
     * @dev Resolve a UserID hash to an address
     * @param _userIdHash UserID hash to resolve
     * @return Address associated with the UserID, or zero address if not found
     */
    function resolveUserId(bytes32 _userIdHash) external view returns (address) {
        return userIdHashToAddress[_userIdHash];
    }
    
    /**
     * @dev Check if an address has a registered UserID
     * @param _user Address to check
     * @return True if UserID is registered
     */
    function hasRegisteredUserId(address _user) external view returns (bool) {
        return addressToUserIdHash[_user] != bytes32(0);
    }
    
    /**
     * @dev Compute the expected UserID hash for an address and role
     * Useful for frontend verification
     * @param _rolePrefix Role prefix string (PAT, DOC, DIA, RES)
     * @param _user Address to compute hash for
     * @return Expected UserID hash
     */
    function computeUserIdHash(string memory _rolePrefix, address _user) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(_rolePrefix, _user));
    }
    
    /**
     * @dev Resolve a short UserID (8-character hash) to an address
     * @param _shortHash First 4 bytes (8 hex characters) of the UserID hash
     * @return Address associated with the short UserID, or zero address if not found or collision
     */
    function resolveShortUserId(bytes4 _shortHash) external view returns (address) {
        return shortUserIdToAddress[_shortHash];
    }
}
