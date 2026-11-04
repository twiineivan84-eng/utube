import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { apiClient } from '../api/client';
import { SaccoMember, ControlledCorrection, AuditLog, Branch, Contribution, Renewal, TurihamwePlan, Beneficiary } from '../types';
import { INITIAL_BRANCHES } from '../constants/branches';
import { localDb } from '../db/local/sqliteEngine';
import { LocalRepository } from '../db/local/localRepository';
import { ContributionReceiptModal } from '../components/turihamwe/ContributionReceiptModal';
import { notifyRecordChanged, subscribeToRecordChanges } from '../utils/systemEvents';
import {
  Users,
  Search,
  UserPlus,
  Shield,
  Lock,
  Edit,
  History,
  AlertCircle,
  CheckCircle,
  Calendar,
  Phone,
  MapPin,
  FileText,
  Clock,
  HeartHandshake,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  Info,
  Check,
  Building2,
  RefreshCw,
  FolderLock,
  Printer,
  ShieldCheck
} from 'lucide-react';

interface MembersViewProps {
  initialOpenRegisterModal?: boolean;
  onRegisterModalClosed?: () => void;
}

export const MembersView: React.FC<MembersViewProps> = ({
  initialOpenRegisterModal,
  onRegisterModalClosed,
}) => {
  const { user, workingBranch, hasPermission } = useAuth();
  const { isOnline } = useSync();

  // State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [members, setMembers] = useState<SaccoMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMember, setSelectedMember] = useState<SaccoMember | null>(null);
  const [profileTab, setProfileTab] = useState<
    'personal' | 'contact' | 'address' | 'turihamwe' | 'beneficiaries' | 'contributions' | 'renewals' | 'claims' | 'history'
  >('personal');
  const [memberAuditHistory, setMemberAuditHistory] = useState<AuditLog[]>([]);
  const [memberCorrections, setMemberCorrections] = useState<ControlledCorrection[]>([]);
  const [memberContributions, setMemberContributions] = useState<Contribution[]>([]);
  const [memberRenewals, setMemberRenewals] = useState<Renewal[]>([]);
  const [memberPlan, setMemberPlan] = useState<TurihamwePlan | null>(null);
  const [memberBeneficiaries, setMemberBeneficiaries] = useState<Beneficiary[]>([]);
  const [selectedContributionForReceipt, setSelectedContributionForReceipt] = useState<Contribution | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [loadingMemberDetails, setLoadingMemberDetails] = useState<boolean>(false);

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [showNormalEditModal, setShowNormalEditModal] = useState<boolean>(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [memberToDelete, setMemberToDelete] = useState<SaccoMember | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Notifications & Feedback
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Registration Beneficiaries & Client Status
  const [regBeneficiaries, setRegBeneficiaries] = useState<
    Array<{ fullName: string; dateOfBirth: string; relationship: string; nationalIdNumber?: string; contactPhone?: string }>
  >([]);
  const [regClientStatus, setRegClientStatus] = useState<'ALIVE' | 'DECEASED'>('ALIVE');

  // Client Status Management Modal
  const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
  const [statusTargetMember, setStatusTargetMember] = useState<SaccoMember | null>(null);
  const [newClientStatus, setNewClientStatus] = useState<'ALIVE' | 'DECEASED'>('ALIVE');
  const [clientStatusReason, setClientStatusReason] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Registration & Normal Edit form state
  const [formData, setFormData] = useState({
    saccoAccountNumber: '',
    fullName: '',
    gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
    dateOfBirth: '',
    nationalIdNumber: '',
    primaryPhone: '',
    alternativePhone: '',
    emailAddress: '',
    district: 'Isingiro',
    subCounty: 'Nyamuyanja',
    parish: '',
    village: '',
    branchId: workingBranch?.id || '',
    registrationDate: new Date().toISOString().split('T')[0],
  });

  // Controlled Correction form state
  const [correctionField, setCorrectionField] = useState<string>('primaryPhone');
  const [correctionValue, setCorrectionValue] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');

  // Permissions checks
  const canView = hasPermission('members.view');
  const canRegister = hasPermission('members.register') || user?.roleCode === 'IT_OFFICER' || user?.roleCode === 'GM';
  const canEdit = hasPermission('members.edit');
  const canDelete = hasPermission('members.delete');
  const canSearch = hasPermission('members.search') || hasPermission('members.view');
  const canViewHistory = hasPermission('members.history');
  const canViewTurihamwe = hasPermission('turihamwe.view') || hasPermission('members.view');
  const canViewContributions = hasPermission('turihamwe.view_contributions') || hasPermission('transactions.view');
  const canViewRenewals = hasPermission('turihamwe.view_renewals');
  const canViewClaims = hasPermission('claims.view');

  // Compute allowed branches
  const allowedBranches: Branch[] = INITIAL_BRANCHES.filter((b: Branch) =>
    user?.hasMultiBranchAccess ? user.allowedBranchIds.includes(b.id) : b.id === workingBranch?.id
  );

  // Load members on mount and branch change
  const loadMembers = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        try {
          const res = await apiClient.getMembers(searchQuery || undefined);
          if (res.success && res.data) {
            setMembers(res.data);
            // Sync with local Dexie store for offline resilience
            for (const m of res.data) {
              await localDb.members.put(m);
            }
            setLoading(false);
            return;
          }
        } catch {
          // Fallback to local store if server request fails
        }
      }

      // Offline or fallback to local Dexie/SQLite storage
      if (searchQuery.trim()) {
        const localResults = await LocalRepository.searchMembers(searchQuery);
        setMembers(localResults);
      } else {
        const localAll = await localDb.members.toArray();
        setMembers(localAll);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [workingBranch, isOnline]);

  // Handle external trigger to open register member modal
  useEffect(() => {
    if (initialOpenRegisterModal && canRegister) {
      setFormData({
        saccoAccountNumber: '',
        fullName: '',
        gender: 'MALE',
        dateOfBirth: '',
        nationalIdNumber: '',
        primaryPhone: '',
        alternativePhone: '',
        emailAddress: '',
        district: 'Isingiro',
        subCounty: 'Nyamuyanja',
        parish: '',
        village: '',
        branchId: workingBranch?.id || '',
        registrationDate: new Date().toISOString().split('T')[0],
      });
      setFormErrors({});
      setShowRegisterModal(true);
      onRegisterModalClosed?.();
    }
  }, [initialOpenRegisterModal, canRegister, workingBranch?.id, onRegisterModalClosed]);

  // Load member details, audit history, plan, beneficiaries, contributions, and renewals when viewing profile
  const loadMemberHistory = useCallback(async (targetMember?: SaccoMember) => {
    const memberToLoad = targetMember || selectedMember;
    if (!memberToLoad) return;
    setLoadingMemberDetails(true);
    const token = localStorage.getItem('turihamwe_token');
    const authHeaders: Record<string, string> = {
      Authorization: token ? `Bearer ${token}` : '',
      'x-working-branch': workingBranch?.id || '',
    };

    try {
      const fetchLocalAudit = async () => {
        try {
          const hasIndex = localDb.auditLogs?.schema?.indexes?.some(i => i.name === 'recordId');
          if (hasIndex) {
            return await localDb.auditLogs
              .where('recordId')
              .equals(memberToLoad.saccoAccountNumber)
              .reverse()
              .sortBy('timestamp');
          }
        } catch {
          // fallback gracefully
        }
        try {
          const all = await localDb.auditLogs.toArray();
          return all
            .filter(l => l.recordId === memberToLoad.saccoAccountNumber)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } catch {
          return [];
        }
      };

      if (isOnline) {
        const res = await apiClient.getMemberByAccount(memberToLoad.saccoAccountNumber);
        if (res.success && res.data) {
          setMemberCorrections(res.data.corrections || []);
          setMemberAuditHistory(res.data.auditLogs || []);
          if ((res.data as any).beneficiaries) {
            setMemberBeneficiaries((res.data as any).beneficiaries);
          }
          if ((res.data as any).clientStatus) {
            setSelectedMember(prev => prev ? { ...prev, ...(res.data as any) } : res.data);
          }
        } else {
          const logs = await fetchLocalAudit();
          setMemberAuditHistory(logs);
        }
      } else {
        const logs = await fetchLocalAudit();
        setMemberAuditHistory(logs);
      }
    } catch {
      try {
        const all = await localDb.auditLogs.toArray();
        const logs = all
          .filter(l => l.recordId === memberToLoad.saccoAccountNumber)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setMemberAuditHistory(logs);
      } catch {
        setMemberAuditHistory([]);
      }
    }

    // Load Plan & Beneficiaries
    try {
      let loadedPlan: TurihamwePlan | null = null;
      if (isOnline) {
        const pRes = await fetch(`/api/turihamwe/plans/account/${encodeURIComponent(memberToLoad.saccoAccountNumber)}`, {
          headers: authHeaders,
        });
        if (pRes.ok) {
          loadedPlan = await pRes.json();
        }
      }
      if (!loadedPlan) {
        const localPlan = await localDb.plans.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).first();
        loadedPlan = localPlan || null;
      }
      setMemberPlan(loadedPlan);

      if (isOnline) {
        // Fetch explicit member beneficiaries route
        const benRes = await fetch(`/api/members/${encodeURIComponent(memberToLoad.saccoAccountNumber)}/beneficiaries`, {
          headers: authHeaders,
        });
        if (benRes.ok) {
          const benData = await benRes.json();
          if (benData.success && Array.isArray(benData.data)) {
            setMemberBeneficiaries(benData.data);
          }
        } else if (loadedPlan) {
          const planDetailsRes = await fetch(`/api/turihamwe/plans/${loadedPlan.id}`, { headers: authHeaders });
          if (planDetailsRes.ok) {
            const pData = await planDetailsRes.json();
            if (pData.beneficiaries) {
              setMemberBeneficiaries(pData.beneficiaries);
            }
          }
        }
      } else {
        const bList = await localDb.beneficiaries.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).toArray();
        if (bList.length > 0) {
          setMemberBeneficiaries(bList);
        }
      }
    } catch {
      const localPlan = await localDb.plans.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).first();
      setMemberPlan(localPlan || null);
      const bList = await localDb.beneficiaries.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).toArray();
      setMemberBeneficiaries(bList);
    }

    // Load Contributions
    try {
      if (isOnline) {
        const cRes = await fetch(`/api/turihamwe/contributions?saccoAccountNumber=${encodeURIComponent(memberToLoad.saccoAccountNumber)}`, {
          headers: authHeaders,
        });
        if (cRes.ok) {
          const cData = await cRes.json();
          setMemberContributions(cData);
        } else {
          const localC = await localDb.contributions.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).reverse().sortBy('contributionDate');
          setMemberContributions(localC);
        }
      } else {
        const localC = await localDb.contributions.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).reverse().sortBy('contributionDate');
        setMemberContributions(localC);
      }
    } catch {
      const localC = await localDb.contributions.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).reverse().sortBy('contributionDate');
      setMemberContributions(localC);
    }

    // Load Renewals
    try {
      if (isOnline) {
        const rRes = await fetch(`/api/turihamwe/renewals?saccoAccountNumber=${encodeURIComponent(memberToLoad.saccoAccountNumber)}`, {
          headers: authHeaders,
        });
        if (rRes.ok) {
          const rData = await rRes.json();
          setMemberRenewals(rData);
        } else {
          const localR = await localDb.renewals.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).reverse().sortBy('renewalDate');
          setMemberRenewals(localR);
        }
      } else {
        const localR = await localDb.renewals.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).reverse().sortBy('renewalDate');
        setMemberRenewals(localR);
      }
    } catch {
      const localR = await localDb.renewals.where('saccoAccountNumber').equals(memberToLoad.saccoAccountNumber).reverse().sortBy('renewalDate');
      setMemberRenewals(localR);
    } finally {
      setLoadingMemberDetails(false);
    }
  }, [selectedMember, isOnline, workingBranch]);

  useEffect(() => {
    if (!selectedMember) {
      setMemberAuditHistory([]);
      setMemberCorrections([]);
      setMemberContributions([]);
      setMemberRenewals([]);
      setMemberPlan(null);
      setMemberBeneficiaries([]);
      return;
    }
    loadMemberHistory(selectedMember);
  }, [selectedMember, loadMemberHistory]);

  // Subscribe to system-wide record changes for instant cross-component updates
  useEffect(() => {
    const unsubscribe = subscribeToRecordChanges((event) => {
      if (event.entityType === 'MEMBER') {
        if (event.action === 'DELETED') {
          setMembers(prev => prev.filter(m => m.saccoAccountNumber !== event.id));
          if (selectedMember?.saccoAccountNumber === event.id) {
            setSelectedMember(null);
          }
        } else if (event.data) {
          const updated = event.data as SaccoMember;
          setMembers(prev => prev.map(m => m.saccoAccountNumber === updated.saccoAccountNumber ? updated : m));
          if (selectedMember?.saccoAccountNumber === updated.saccoAccountNumber) {
            setSelectedMember(updated);
            loadMemberHistory(updated);
          }
        }
      } else if (['PLAN', 'CONTRIBUTION', 'RENEWAL'].includes(event.entityType)) {
        if (selectedMember) {
          loadMemberHistory(selectedMember);
        }
      }
    });

    return unsubscribe;
  }, [selectedMember, loadMemberHistory]);

  // Validation function
  const validateForm = (isEdit = false): boolean => {
    const errors: Record<string, string> = {};

    if (!isEdit && !formData.saccoAccountNumber.trim()) {
      errors.saccoAccountNumber = 'SACCO Account Number is required.';
    }

    if (!formData.fullName.trim()) {
      errors.fullName = 'Full Legal Name is required.';
    }

    if (!formData.gender) {
      errors.gender = 'Gender is required.';
    }

    if (!formData.dateOfBirth) {
      errors.dateOfBirth = 'Date of birth is required.';
    } else {
      const dobTime = new Date(formData.dateOfBirth).getTime();
      if (isNaN(dobTime) || dobTime > Date.now()) {
        errors.dateOfBirth = 'Date of birth must be a valid past date.';
      }
    }

    if (!formData.nationalIdNumber.trim()) {
      errors.nationalIdNumber = 'National ID (NIN) is required.';
    }

    if (!formData.primaryPhone.trim()) {
      errors.primaryPhone = 'Primary phone number is required.';
    } else {
      const cleanPhone = formData.primaryPhone.replace(/[\s\-()]/g, '');
      if (!/^\+?[0-9]{9,15}$/.test(cleanPhone)) {
        errors.primaryPhone = 'Invalid telephone format (e.g., +256772123456 or 0772123456).';
      }
    }

    if (formData.alternativePhone && formData.alternativePhone.trim()) {
      const cleanAlt = formData.alternativePhone.replace(/[\s\-()]/g, '');
      if (!/^\+?[0-9]{9,15}$/.test(cleanAlt)) {
        errors.alternativePhone = 'Invalid alternative phone format.';
      }
    }

    if (formData.emailAddress && formData.emailAddress.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.emailAddress.trim())) {
        errors.emailAddress = 'Invalid email address format.';
      }
    }

    if (!formData.district.trim()) errors.district = 'District is required.';
    if (!formData.subCounty.trim()) errors.subCounty = 'Sub-county is required.';
    if (!formData.parish.trim()) errors.parish = 'Parish is required.';
    if (!formData.village.trim()) errors.village = 'Village is required.';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Search handler (CRITICAL: Member search must support ONLY SACCO account number and member name)
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;

    if (!searchQuery.trim()) {
      loadMembers();
      return;
    }

    setLoading(true);
    try {
      if (isOnline) {
        try {
          const res = await apiClient.getMembers(searchQuery.trim());
          if (res.success && res.data) {
            setMembers(res.data);
            setLoading(false);
            return;
          }
        } catch {
          // Local fallback
        }
      }

      const results = await LocalRepository.searchMembers(searchQuery.trim());
      setMembers(results);
    } finally {
      setLoading(false);
    }
  };

  // Register Member handler
  const handleRegisterMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (!canRegister) {
      setNotification({
        type: 'error',
        message: 'Permission Denied: You do not have permission to register SACCO members.',
      });
      return;
    }

    if (!validateForm(false)) {
      setNotification({
        type: 'error',
        message: 'Please resolve the highlighted validation errors before submitting.',
      });
      return;
    }

    // Validate registration beneficiaries if provided
    for (let i = 0; i < regBeneficiaries.length; i++) {
      const b = regBeneficiaries[i];
      if (!b.fullName.trim()) {
        setNotification({ type: 'error', message: `Beneficiary #${i + 1}: Full legal name is required.` });
        return;
      }
      if (!b.dateOfBirth) {
        setNotification({ type: 'error', message: `Beneficiary #${i + 1} (${b.fullName}): Date of birth is required.` });
        return;
      }
      const bDobTime = new Date(b.dateOfBirth).getTime();
      if (isNaN(bDobTime)) {
        setNotification({ type: 'error', message: `Beneficiary #${i + 1} (${b.fullName}): Date of birth is invalid.` });
        return;
      }
      if (bDobTime > Date.now()) {
        setNotification({ type: 'error', message: `Beneficiary #${i + 1} (${b.fullName}): Date of birth cannot be in the future.` });
        return;
      }
      if (!b.relationship.trim()) {
        setNotification({ type: 'error', message: `Beneficiary #${i + 1} (${b.fullName}): Relationship to member is required.` });
        return;
      }
    }

    const cleanAccountNo = formData.saccoAccountNumber.trim().toUpperCase();

    // 1. Account Number Rule: Check duplicate locally
    const localExisting = await localDb.members.get(cleanAccountNo);
    if (localExisting) {
      // EXACT REQUIRED SPECIFICATION ERROR MESSAGE
      setNotification({
        type: 'error',
        message: 'This SACCO account number is already registered.',
      });
      return;
    }

    // Determine target branch
    let targetBranchId = workingBranch?.id || 'br-nyamuyanja';
    if (user?.hasMultiBranchAccess && formData.branchId) {
      if (user.allowedBranchIds.includes(formData.branchId)) {
        targetBranchId = formData.branchId;
      }
    }
    const branchEntity = allowedBranches.find((b: Branch) => b.id === targetBranchId) || workingBranch;

    const newMember: SaccoMember = {
      saccoAccountNumber: cleanAccountNo,
      fullName: formData.fullName.trim(),
      gender: formData.gender,
      dateOfBirth: formData.dateOfBirth,
      nationalIdNumber: formData.nationalIdNumber.trim().toUpperCase(),
      primaryPhone: formData.primaryPhone.trim(),
      alternativePhone: formData.alternativePhone?.trim() || undefined,
      emailAddress: formData.emailAddress?.trim().toLowerCase() || undefined,
      district: formData.district.trim(),
      subCounty: formData.subCounty.trim(),
      parish: formData.parish.trim(),
      village: formData.village.trim(),
      registrationDate: formData.registrationDate || new Date().toISOString().split('T')[0],
      branchId: targetBranchId,
      branchName: branchEntity?.name,
      clientStatus: regClientStatus,
      clientStatusUpdatedAt: new Date().toISOString(),
      clientStatusUpdatedByUserId: user?.id,
      clientStatusUpdatedByUsername: user?.username,
      createdById: user?.id,
      createdByUsername: user?.username,
      isLockedFromNormalEdit: false,
      turihamweStatus: 'UNREGISTERED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Attempt online registration first if connected
    let savedOnline = false;
    if (isOnline) {
      try {
        const res = await apiClient.registerMember({
          ...newMember,
          beneficiaries: regBeneficiaries.map((b, idx) => ({
            fullName: b.fullName.trim(),
            dateOfBirth: b.dateOfBirth,
            relationship: b.relationship.trim(),
            nationalIdNumber: b.nationalIdNumber?.trim() || undefined,
            contactPhone: b.contactPhone?.trim() || undefined,
          })),
        });
        if (res.success && res.data) {
          savedOnline = true;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : '';
        if (errMsg.includes('already registered')) {
          setNotification({
            type: 'error',
            message: 'This SACCO account number is already registered.',
          });
          return;
        }
      }
    }

    // Persist locally in SQLite/Dexie
    await localDb.members.put(newMember);

    // Save beneficiaries locally
    for (let i = 0; i < regBeneficiaries.length; i++) {
      const b = regBeneficiaries[i];
      const localBen: Beneficiary = {
        id: `ben-local-${Date.now()}-${i}`,
        saccoAccountNumber: cleanAccountNo,
        planId: '',
        fullName: b.fullName.trim(),
        relationship: b.relationship.trim(),
        dateOfBirth: b.dateOfBirth,
        nationalIdNumber: b.nationalIdNumber?.trim() || undefined,
        contactPhone: b.contactPhone?.trim() || undefined,
        percentageAllocation: Math.floor(100 / (regBeneficiaries.length || 1)),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await localDb.beneficiaries.put(localBen);
    }

    // Record audit log
    await LocalRepository.recordLocalAudit({
      userId: user!.id,
      username: user!.username,
      userFullName: user!.fullName,
      branchId: targetBranchId,
      branchName: branchEntity?.name || 'SACCO Branch',
      action: 'MEMBER_CREATED',
      recordType: 'MEMBERS',
      recordId: newMember.saccoAccountNumber,
      newValue: `Registered member ${newMember.fullName} (A/C: ${newMember.saccoAccountNumber}, Status: ${newMember.clientStatus}) with ${regBeneficiaries.length} beneficiaries at ${branchEntity?.name}`,
    });

    if (!savedOnline) {
      await LocalRepository.queueForSync({
        entityType: 'MEMBER',
        entityId: newMember.saccoAccountNumber,
        operation: 'INSERT',
        payload: {
          ...newMember,
          beneficiaries: regBeneficiaries,
        },
        branchId: targetBranchId,
        userId: user!.id,
      });
    }

    setMembers(prev => [newMember, ...prev.filter(m => m.saccoAccountNumber !== newMember.saccoAccountNumber)]);
    setShowRegisterModal(false);
    notifyRecordChanged('MEMBER', 'CREATED', newMember.saccoAccountNumber, newMember);
    setNotification({
      type: 'success',
      message: savedOnline
        ? `Member ${newMember.fullName} (${newMember.saccoAccountNumber}) registered with status ${newMember.clientStatus} and ${regBeneficiaries.length} beneficiaries.`
        : `Member ${newMember.fullName} (${newMember.saccoAccountNumber}) registered locally. Queued for background synchronization.`,
    });

    // Reset form
    setFormData({
      saccoAccountNumber: '',
      fullName: '',
      gender: 'MALE',
      dateOfBirth: '',
      nationalIdNumber: '',
      primaryPhone: '',
      alternativePhone: '',
      emailAddress: '',
      district: 'Isingiro',
      subCounty: 'Nyamuyanja',
      parish: '',
      village: '',
      branchId: workingBranch?.id || '',
      registrationDate: new Date().toISOString().split('T')[0],
    });
    setRegBeneficiaries([]);
    setRegClientStatus('ALIVE');
    setFormErrors({});
  };

  // Explicit Client Status handler (ALIVE / DECEASED with audit log)
  const handleUpdateClientStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTargetMember) return;
    if (!clientStatusReason.trim()) {
      setNotification({ type: 'error', message: 'An audit reason is required to modify client status.' });
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const res = await apiClient.updateMemberClientStatus(
        statusTargetMember.saccoAccountNumber,
        newClientStatus,
        clientStatusReason.trim()
      );

      if (res.success) {
        const updatedMember: SaccoMember = {
          ...statusTargetMember,
          clientStatus: newClientStatus,
          clientStatusReason: clientStatusReason.trim(),
          clientStatusUpdatedAt: new Date().toISOString(),
          clientStatusUpdatedByUsername: user?.username,
          clientStatusUpdatedByUserId: user?.id,
        };

        // Persist locally
        await localDb.members.put(updatedMember);

        // Update state
        setMembers(prev => prev.map(m => (m.saccoAccountNumber === updatedMember.saccoAccountNumber ? updatedMember : m)));
        if (selectedMember?.saccoAccountNumber === updatedMember.saccoAccountNumber) {
          setSelectedMember(updatedMember);
        }

        setNotification({
          type: 'success',
          message: `Client status for ${updatedMember.fullName} (${updatedMember.saccoAccountNumber}) successfully updated to ${newClientStatus}.`,
        });
        setShowStatusModal(false);
        setStatusTargetMember(null);
        setClientStatusReason('');
        notifyRecordChanged('MEMBER', 'UPDATED', updatedMember.saccoAccountNumber, updatedMember);
      } else {
        setNotification({ type: 'error', message: res.message || 'Failed to update client status.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating client status.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Normal Edit handler (within 5-day rule)
  const handleNormalEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !canEdit) return;

    // Check 5-day rule
    const isWithin5Days = LocalRepository.isWithinFiveDaysWindow(selectedMember.registrationDate);
    if (!isWithin5Days) {
      setNotification({
        type: 'error',
        message: 'Editing locked — record is older than 5 days.',
      });
      setShowNormalEditModal(false);
      return;
    }

    if (!validateForm(true)) {
      setNotification({
        type: 'error',
        message: 'Please resolve validation errors before saving.',
      });
      return;
    }

    const updates: Partial<SaccoMember> = {
      fullName: formData.fullName.trim(),
      gender: formData.gender,
      dateOfBirth: formData.dateOfBirth,
      nationalIdNumber: formData.nationalIdNumber.trim().toUpperCase(),
      primaryPhone: formData.primaryPhone.trim(),
      alternativePhone: formData.alternativePhone?.trim() || undefined,
      emailAddress: formData.emailAddress?.trim().toLowerCase() || undefined,
      district: formData.district.trim(),
      subCounty: formData.subCounty.trim(),
      parish: formData.parish.trim(),
      village: formData.village.trim(),
      updatedAt: new Date().toISOString(),
    };

    let updatedMember: SaccoMember = {
      ...selectedMember,
      ...updates,
    };

    if (isOnline) {
      try {
        const res = await apiClient.updateMember(selectedMember.saccoAccountNumber, updates);
        if (res.success && res.data) {
          updatedMember = res.data;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : '';
        if (errMsg.includes('older than 5 days')) {
          setNotification({
            type: 'error',
            message: 'Editing locked — record is older than 5 days.',
          });
          setShowNormalEditModal(false);
          return;
        }
      }
    }

    // Save and propagate changes across local storage (members, plans, contributions, renewals, claims, SMS)
    await LocalRepository.updateMemberLocally(updatedMember);

    // Record audit trail
    const auditRecord = await LocalRepository.recordLocalAudit({
      userId: user!.id,
      username: user!.username,
      userFullName: user!.fullName,
      branchId: workingBranch!.id,
      branchName: workingBranch!.name,
      action: 'MEMBER_EDITED',
      recordType: 'MEMBERS',
      recordId: selectedMember.saccoAccountNumber,
      previousValue: JSON.stringify(selectedMember),
      newValue: JSON.stringify(updatedMember),
      reason: 'Normal edit within authorized 5-day window',
    });

    if (!isOnline) {
      await LocalRepository.queueForSync({
        entityType: 'MEMBER',
        entityId: updatedMember.saccoAccountNumber,
        operation: 'UPDATE',
        payload: updatedMember,
        branchId: workingBranch!.id,
        userId: user!.id,
      });
    }

    // Immediately reflect changes in active state and open profile views
    setMembers(prev => prev.map(m => (m.saccoAccountNumber === updatedMember.saccoAccountNumber ? updatedMember : m)));
    setSelectedMember(updatedMember);
    setMemberAuditHistory(prev => [auditRecord, ...prev]);

    // Propagate updated name to member's plan, contributions, and renewals in current view
    if (updatedMember.fullName !== selectedMember.fullName) {
      setMemberPlan(prev => (prev ? { ...prev, memberName: updatedMember.fullName } : null));
      setMemberContributions(prev => prev.map(c => ({ ...c, memberName: updatedMember.fullName })));
      setMemberRenewals(prev => prev.map(r => ({ ...r, memberName: updatedMember.fullName })));
    }

    setShowNormalEditModal(false);

    // Broadcast system-wide change notification to update all views & components
    notifyRecordChanged('MEMBER', 'UPDATED', updatedMember.saccoAccountNumber, updatedMember);

    setNotification({
      type: 'success',
      message: `Member record for ${updatedMember.fullName} updated and reflected across the system successfully.`,
    });
  };

  // Controlled Correction handler (post 5-day lock)
  const handleControlledCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !canEdit) return;

    if (!correctionReason.trim()) {
      setNotification({
        type: 'error',
        message: 'A detailed institutional justification reason is required for controlled corrections.',
      });
      return;
    }

    if (!correctionValue.trim()) {
      setNotification({
        type: 'error',
        message: 'New corrected value must not be empty.',
      });
      return;
    }

    const prevVal = String((selectedMember as unknown as Record<string, unknown>)[correctionField] ?? '');

    const correctionData = {
      fieldChanged: correctionField,
      newValue: correctionValue.trim(),
      reason: correctionReason.trim(),
    };

    let updatedMember: SaccoMember = {
      ...selectedMember,
      [correctionField]: correctionValue.trim(),
      updatedAt: new Date().toISOString(),
    };

    let serverCorrection: ControlledCorrection | undefined;
    if (isOnline) {
      try {
        const res = await apiClient.submitControlledCorrection(selectedMember.saccoAccountNumber, correctionData);
        if (res.success && res.data) {
          updatedMember = res.data;
          serverCorrection = res.correction;
        }
      } catch {
        // Fallback to local
      }
    }

    // Save and propagate changes across local storage (members, plans, contributions, renewals, claims, SMS)
    await LocalRepository.updateMemberLocally(updatedMember);

    // Write strict audit trail record
    const auditRecord = await LocalRepository.recordLocalAudit({
      userId: user!.id,
      username: user!.username,
      userFullName: user!.fullName,
      branchId: workingBranch!.id,
      branchName: workingBranch!.name,
      action: 'MEMBER_CORRECTION',
      recordType: 'MEMBERS',
      recordId: selectedMember.saccoAccountNumber,
      previousValue: `${correctionField}: ${prevVal}`,
      newValue: `${correctionField}: ${correctionValue.trim()}`,
      reason: correctionReason.trim(),
    });

    // Record local correction if server didn't provide one
    const localCorrection: ControlledCorrection = serverCorrection || {
      id: `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      saccoAccountNumber: selectedMember.saccoAccountNumber,
      userId: user!.id,
      username: user!.username,
      branchId: workingBranch!.id,
      branchName: workingBranch!.name,
      timestamp: new Date().toISOString(),
      fieldChanged: correctionField,
      previousValue: prevVal,
      newValue: correctionValue.trim(),
      reason: correctionReason.trim(),
    };

    setMemberCorrections(prev => [localCorrection, ...prev]);
    setMemberAuditHistory(prev => [auditRecord, ...prev]);
    setMembers(prev => prev.map(m => (m.saccoAccountNumber === updatedMember.saccoAccountNumber ? updatedMember : m)));
    setSelectedMember(updatedMember);

    // Propagate updated name to member's plan, contributions, and renewals in current view
    if (correctionField === 'fullName') {
      const newName = correctionValue.trim();
      setMemberPlan(prev => (prev ? { ...prev, memberName: newName } : null));
      setMemberContributions(prev => prev.map(c => ({ ...c, memberName: newName })));
      setMemberRenewals(prev => prev.map(r => ({ ...r, memberName: newName })));
    }

    setShowCorrectionModal(false);
    setCorrectionValue('');
    setCorrectionReason('');

    // Broadcast system-wide change notification to update all views & components
    notifyRecordChanged('MEMBER', 'CORRECTED', updatedMember.saccoAccountNumber, updatedMember);

    setNotification({
      type: 'success',
      message: 'Controlled member record correction audited, saved, and reflected across the system successfully.',
    });
  };

  // Open edit modal helper
  const openEditModal = (member: SaccoMember) => {
    const isWithin5Days = LocalRepository.isWithinFiveDaysWindow(member.registrationDate);
    if (!isWithin5Days) {
      setNotification({
        type: 'error',
        message: 'Editing locked — record is older than 5 days.',
      });
      setSelectedMember(member);
      setShowCorrectionModal(true);
      return;
    }

    setFormData({
      saccoAccountNumber: member.saccoAccountNumber,
      fullName: member.fullName,
      gender: member.gender,
      dateOfBirth: member.dateOfBirth,
      nationalIdNumber: member.nationalIdNumber,
      primaryPhone: member.primaryPhone,
      alternativePhone: member.alternativePhone || '',
      emailAddress: member.emailAddress || '',
      district: member.district,
      subCounty: member.subCounty,
      parish: member.parish,
      village: member.village,
      branchId: member.branchId,
      registrationDate: member.registrationDate,
    });
    setFormErrors({});
    setSelectedMember(member);
    setShowNormalEditModal(true);
  };

  // Open delete confirmation modal (Admin only)
  const openDeleteConfirm = (member: SaccoMember) => {
    if (!canDelete) {
      setNotification({
        type: 'error',
        message: 'Unauthorized: Member deletion is restricted to authorized Administrators only.',
      });
      return;
    }
    setMemberToDelete(member);
    setDeleteReason('');
    setShowDeleteModal(true);
  };

  // Confirm and execute safe member deletion/deactivation (Admin only)
  const handleConfirmDelete = async () => {
    if (!memberToDelete || !canDelete) return;

    if (!deleteReason.trim()) {
      setNotification({
        type: 'error',
        message: 'A mandatory administrative deletion reason is required for audit logs.',
      });
      return;
    }

    setIsDeleting(true);
    try {
      if (isOnline) {
        const res = await apiClient.deleteMember(memberToDelete.saccoAccountNumber, deleteReason.trim());
        if (res.success) {
          setNotification({
            type: 'success',
            message: `Member ${memberToDelete.fullName} (${memberToDelete.saccoAccountNumber}) was safely deactivated/deleted. Referential integrity and audit trails preserved.`,
          });
        }
      }

      // Mark locally as soft-deleted in Dexie and propagate plan suspension
      const updatedLocal: SaccoMember = {
        ...memberToDelete,
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedByUserId: user?.id,
        deletedByUsername: user?.username,
        deletedReason: deleteReason.trim(),
        turihamweStatus: 'SUSPENDED',
        updatedAt: new Date().toISOString(),
      };
      await LocalRepository.updateMemberLocally(updatedLocal);

      // Record local audit log
      await LocalRepository.recordLocalAudit({
        userId: user!.id,
        username: user!.username,
        userFullName: user!.fullName,
        branchId: workingBranch!.id,
        branchName: workingBranch!.name,
        action: 'MEMBER_DELETED',
        recordType: 'MEMBERS',
        recordId: memberToDelete.saccoAccountNumber,
        previousValue: `Status: ${memberToDelete.turihamweStatus || 'UNREGISTERED'}`,
        newValue: `Deleted/Deactivated: ${deleteReason.trim()}`,
        reason: deleteReason.trim(),
      });

      setShowDeleteModal(false);
      setMemberToDelete(null);
      setDeleteReason('');
      if (selectedMember?.saccoAccountNumber === memberToDelete.saccoAccountNumber) {
        setSelectedMember(null);
      }
      await loadMembers();

      // Broadcast system-wide change notification to update all views & components
      notifyRecordChanged('MEMBER', 'DELETED', memberToDelete.saccoAccountNumber, updatedLocal);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while deleting member.';
      setNotification({ type: 'error', message: msg });
    } finally {
      setIsDeleting(false);
    }
  };

  // If user does not have permission to view members, deny access cleanly
  if (!canView) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto shadow-xs">
        <FolderLock className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-1">
          Your account does not possess the <code className="font-mono text-blue-700">members.view</code> permission required to access the SACCO Member Management module.
        </p>
        <p className="text-[11px] text-slate-400 mt-3">
          Contact your Branch Manager or SACCO IT Administrator if you require operational access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-700" />
              SACCO Member Management
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
              Phase 2 Operational Core
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Primary Identifier: SACCO Account Number (Strict 1:1 Relationship • Immutable)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canRegister && (
            <button
              onClick={() => {
                setFormData({
                  saccoAccountNumber: '',
                  fullName: '',
                  gender: 'MALE',
                  dateOfBirth: '',
                  nationalIdNumber: '',
                  primaryPhone: '',
                  alternativePhone: '',
                  emailAddress: '',
                  district: 'Isingiro',
                  subCounty: 'Nyamuyanja',
                  parish: '',
                  village: '',
                  branchId: workingBranch?.id || '',
                  registrationDate: new Date().toISOString().split('T')[0],
                });
                setFormErrors({});
                setShowRegisterModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition"
            >
              <UserPlus className="w-4 h-4" />
              Register Member
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between border ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-semibold">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 text-xs px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search Interface (CRITICAL: Strictly Account Number and Full Name ONLY) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search strictly by SACCO Account Number or Member Name..."
              className="w-full pl-10 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs transition"
            >
              Search Members
            </button>
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  loadMembers();
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
              >
                Clear
              </button>
            )}
          </div>
        </form>
        <p className="text-[11px] text-slate-400 mt-2">
          Note: System policy strictly restricts search criteria to <strong>SACCO Account Number</strong> and <strong>Member Name</strong> only.
        </p>
      </div>

      {/* Members Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Registered Members Directory ({members.length})
          </div>
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            Working Branch: {workingBranch?.name}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">SACCO A/C No.</th>
                <th className="px-6 py-3">Member Name</th>
                <th className="px-6 py-3">Branch</th>
                <th className="px-6 py-3">Registration Date</th>
                <th className="px-6 py-3">Client Status</th>
                <th className="px-6 py-3">Turihamwe Status</th>
                <th className="px-6 py-3">Editing Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" />
                    Loading member records...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    No SACCO member records found matching the query.
                  </td>
                </tr>
              ) : (
                members.map(member => {
                  const isWithin5Days = LocalRepository.isWithinFiveDaysWindow(member.registrationDate);

                  return (
                    <tr key={member.saccoAccountNumber} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-3.5 font-mono font-bold text-blue-900 tracking-wider">
                        {member.saccoAccountNumber}
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-slate-900">
                        {member.fullName}
                      </td>
                      <td className="px-6 py-3.5 text-slate-600">
                        {member.branchName || workingBranch?.name}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-slate-600">
                        {member.registrationDate}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            (member.clientStatus || 'ALIVE') === 'ALIVE'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {(member.clientStatus || 'ALIVE') === 'ALIVE' ? 'ALIVE' : 'DECEASED'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            member.turihamweStatus === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : member.turihamweStatus === 'EXPIRED'
                              ? 'bg-red-50 text-red-800 border-red-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {member.turihamweStatus || 'UNREGISTERED'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        {isWithin5Days ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Normal Edit Window (&le;5d)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            <Lock className="w-3 h-3 text-slate-400" />
                            Editing Locked (&gt;5d)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedMember(member);
                            setProfileTab('personal');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded transition"
                        >
                          View Profile
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => openEditModal(member)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded transition ${
                              isWithin5Days
                                ? 'text-emerald-700 hover:bg-emerald-50'
                                : 'text-amber-700 hover:bg-amber-50'
                            }`}
                          >
                            {isWithin5Days ? 'Edit' : 'Correction'}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => openDeleteConfirm(member)}
                            className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded transition"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Profile Modal / Drawer */}
      {selectedMember && !showNormalEditModal && !showCorrectionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center font-bold text-sm">
                  {selectedMember.fullName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      {selectedMember.fullName}
                    </h2>
                    <span className="font-mono text-xs font-bold text-blue-800 px-2 py-0.5 rounded bg-blue-50 border border-blue-200">
                      {selectedMember.saccoAccountNumber}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${
                        (selectedMember.clientStatus || 'ALIVE') === 'ALIVE'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {(selectedMember.clientStatus || 'ALIVE') === 'ALIVE' ? '● ALIVE' : '● DECEASED'}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => {
                          setStatusTargetMember(selectedMember);
                          setNewClientStatus((selectedMember.clientStatus || 'ALIVE') === 'ALIVE' ? 'DECEASED' : 'ALIVE');
                          setClientStatusReason('');
                          setShowStatusModal(true);
                        }}
                        className="text-[11px] font-semibold px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 transition"
                        title="Authorized update of member vital client status (ALIVE / DECEASED)"
                      >
                        Change Status
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Nyamuyanja SACCO Ltd • Branch: {selectedMember.branchName || workingBranch?.name}
                    {selectedMember.clientStatusReason && (
                      <span className="ml-2 text-[11px] text-amber-700 italic">
                        (Status note: {selectedMember.clientStatusReason})
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMember(null)}
                className="text-slate-600 hover:text-slate-900 transition text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
              >
                Close Profile
              </button>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="border-b border-slate-200 px-6 bg-slate-50/50 flex space-x-4 text-xs font-semibold overflow-x-auto shrink-0">
              <button
                onClick={() => setProfileTab('personal')}
                className={`py-2.5 border-b-2 transition ${
                  profileTab === 'personal'
                    ? 'border-blue-700 text-blue-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Personal Info
              </button>
              <button
                onClick={() => setProfileTab('contact')}
                className={`py-2.5 border-b-2 transition ${
                  profileTab === 'contact'
                    ? 'border-blue-700 text-blue-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Contact Info
              </button>
              <button
                onClick={() => setProfileTab('address')}
                className={`py-2.5 border-b-2 transition ${
                  profileTab === 'address'
                    ? 'border-blue-700 text-blue-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Address
              </button>
              {canViewTurihamwe && (
                <>
                  <button
                    onClick={() => setProfileTab('turihamwe')}
                    className={`py-2.5 border-b-2 transition flex items-center gap-1.5 ${
                      profileTab === 'turihamwe'
                        ? 'border-blue-700 text-blue-800'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Turihamwe Plan
                    {memberPlan && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        memberPlan.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {memberPlan.status}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setProfileTab('beneficiaries')}
                    className={`py-2.5 border-b-2 transition flex items-center gap-1.5 ${
                      profileTab === 'beneficiaries'
                        ? 'border-blue-700 text-blue-800'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Beneficiaries
                    {memberBeneficiaries.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-800 font-bold">
                        {memberBeneficiaries.length}
                      </span>
                    )}
                  </button>
                </>
              )}
              {canViewContributions && (
                <button
                  onClick={() => setProfileTab('contributions')}
                  className={`py-2.5 border-b-2 transition flex items-center gap-1.5 ${
                    profileTab === 'contributions'
                      ? 'border-blue-700 text-blue-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Contributions
                  {memberContributions.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-bold">
                      {memberContributions.length}
                    </span>
                  )}
                </button>
              )}
              {canViewRenewals && (
                <button
                  onClick={() => setProfileTab('renewals')}
                  className={`py-2.5 border-b-2 transition flex items-center gap-1.5 ${
                    profileTab === 'renewals'
                      ? 'border-blue-700 text-blue-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Renewals
                  {memberRenewals.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 font-bold">
                      {memberRenewals.length}
                    </span>
                  )}
                </button>
              )}
              {canViewClaims && (
                <button
                  onClick={() => setProfileTab('claims')}
                  className={`py-2.5 border-b-2 transition ${
                    profileTab === 'claims'
                      ? 'border-blue-700 text-blue-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Claims
                </button>
              )}
              {canViewHistory && (
                <button
                  onClick={() => setProfileTab('history')}
                  className={`py-2.5 border-b-2 transition ${
                    profileTab === 'history'
                      ? 'border-blue-700 text-blue-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Audit / History
                </button>
              )}
            </div>

            {/* Profile Tab Contents */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700 flex-1">
              {/* 5-Day Rule Status Banner */}
              <div
                className={`p-3.5 rounded-lg border flex items-center justify-between ${
                  LocalRepository.isWithinFiveDaysWindow(selectedMember.registrationDate)
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {LocalRepository.isWithinFiveDaysWindow(selectedMember.registrationDate) ? (
                    <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold">
                      {LocalRepository.isWithinFiveDaysWindow(selectedMember.registrationDate)
                        ? 'Normal Editing Window Active (Record registered within 5 days)'
                        : 'Editing locked — record is older than 5 days.'}
                    </span>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {LocalRepository.isWithinFiveDaysWindow(selectedMember.registrationDate)
                        ? 'Authorized staff may edit permitted information directly.'
                        : 'Direct overwriting is locked by system rule. Use Controlled Correction to record audited changes.'}
                    </p>
                  </div>
                </div>
                {canEdit && (
                  <div>
                    {LocalRepository.isWithinFiveDaysWindow(selectedMember.registrationDate) ? (
                      <button
                        onClick={() => openEditModal(selectedMember)}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition"
                      >
                        Edit Information
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowCorrectionModal(true)}
                        className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold transition"
                      >
                        Initiate Controlled Correction
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Personal Information */}
              {profileTab === 'personal' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] pb-1 border-b flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-700" />
                    Personal Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 font-medium">SACCO Account Number (Primary ID):</span>
                      <div className="font-mono font-bold text-blue-900 text-sm mt-0.5">
                        {selectedMember.saccoAccountNumber}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Full Legal Name:</span>
                      <div className="font-semibold text-slate-900 mt-0.5">{selectedMember.fullName}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Gender:</span>
                      <div className="font-semibold text-slate-900 mt-0.5">{selectedMember.gender}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Date of Birth:</span>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5">{selectedMember.dateOfBirth}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">National ID (NIN):</span>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">
                        {selectedMember.nationalIdNumber}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Registered Branch:</span>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {selectedMember.branchName || workingBranch?.name}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Contact Information */}
              {profileTab === 'contact' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] pb-1 border-b flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-700" />
                    Contact Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 font-medium">Primary Phone Number (Mandatory):</span>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">{selectedMember.primaryPhone}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Alternative Phone Number:</span>
                      <div className="font-mono text-slate-800 mt-0.5">
                        {selectedMember.alternativePhone || 'None Provided'}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500 font-medium">Email Address:</span>
                      <div className="text-slate-800 mt-0.5">
                        {selectedMember.emailAddress || 'None Provided'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Address */}
              {profileTab === 'address' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] pb-1 border-b flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-700" />
                    Residential & Operational Address
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 font-medium">District:</span>
                      <div className="font-semibold text-slate-900 mt-0.5">{selectedMember.district}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Sub-county:</span>
                      <div className="font-semibold text-slate-900 mt-0.5">{selectedMember.subCounty}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Parish:</span>
                      <div className="font-semibold text-slate-900 mt-0.5">{selectedMember.parish}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Village:</span>
                      <div className="font-semibold text-slate-900 mt-0.5">{selectedMember.village}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Turihamwe Information */}
              {profileTab === 'turihamwe' && canViewTurihamwe && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b">
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <HeartHandshake className="w-3.5 h-3.5 text-blue-700" />
                      Turihamwe Protection Plan Overview
                    </h3>
                    {memberPlan && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        memberPlan.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        Plan Status: {memberPlan.status}
                      </span>
                    )}
                  </div>

                  {memberPlan ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-slate-500 font-medium">Plan Reference ID:</span>
                          <div className="font-mono font-bold text-blue-900 text-xs mt-0.5">
                            {memberPlan.id}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Scheme Type:</span>
                          <div className="font-semibold text-slate-900 mt-0.5">
                            {memberPlan.planCode || 'Standard'} Funeral & Protection
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Enrolment Date:</span>
                          <div className="font-mono font-semibold text-slate-900 mt-0.5">
                            {memberPlan.enrolmentDate || selectedMember.registrationDate}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Effective Start Date:</span>
                          <div className="font-mono font-semibold text-slate-900 mt-0.5">
                            {memberPlan.effectiveStartDate || '—'}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Current Expiry Date:</span>
                          <div className="font-mono font-bold text-emerald-800 mt-0.5">
                            {memberPlan.currentExpiryDate || '—'}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Registered Branch:</span>
                          <div className="font-semibold text-slate-900 mt-0.5">
                            {memberPlan.registeredBranchName || workingBranch?.name}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Enrolled Beneficiaries:</span>
                          <div className="font-semibold text-slate-900 mt-0.5">
                            {memberBeneficiaries.length} registered
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Total Contributions:</span>
                          <div className="font-bold text-blue-900 mt-0.5">
                            UGX {(memberPlan.totalContributionsAmount || memberContributions.reduce((s, c) => s + (c.amount || 0), 0)).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Enrolled By Officer:</span>
                          <div className="font-mono text-slate-700 mt-0.5">
                            {memberPlan.registeredByUsername || 'System Staff'}
                          </div>
                        </div>
                      </div>

                      {memberPlan.notes && (
                        <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-100 text-xs text-blue-900">
                          <strong>Plan Notes:</strong> {memberPlan.notes}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center">
                      <HeartHandshake className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-700">No Active Protection Plan</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                        SACCO Member {selectedMember.saccoAccountNumber} ({selectedMember.fullName}) is currently unregistered for the Turihamwe Insurance scheme.
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2">
                        To register this member into the scheme, navigate to the Turihamwe module and select "Enroll Member in Protection Plan".
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Beneficiaries */}
              {profileTab === 'beneficiaries' && canViewTurihamwe && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b">
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-700" />
                      Registered Beneficiaries ({memberBeneficiaries.length})
                    </h3>
                  </div>

                  {memberBeneficiaries.length === 0 ? (
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center">
                      <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-700">No Beneficiaries Registered</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                        No beneficiary records have been enrolled under SACCO Member {selectedMember.saccoAccountNumber}.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3">Beneficiary Name</th>
                            <th className="py-2.5 px-3">Relationship</th>
                            <th className="py-2.5 px-3">National ID (NIN)</th>
                            <th className="py-2.5 px-3">Phone Number</th>
                            <th className="py-2.5 px-3 text-right">Allocation (%)</th>
                            <th className="py-2.5 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {memberBeneficiaries.map((b) => (
                            <tr key={b.id} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 px-3 font-semibold text-slate-900">{b.fullName}</td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                                  {b.relationship}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">{b.nationalIdNumber || '—'}</td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">{b.contactPhone || '—'}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-blue-900">{b.percentageAllocation || 100}%</td>
                              <td className="py-2.5 px-3 text-[11px]">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  b.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {b.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Contribution History */}
              {profileTab === 'contributions' && canViewContributions && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b">
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-blue-700" />
                      Member Contribution Ledger ({memberContributions.length})
                    </h3>
                    <div className="text-xs font-bold text-slate-800">
                      Total: <span className="font-mono text-blue-900">UGX {memberContributions.reduce((s, c) => s + (c.amount || 0), 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {memberContributions.length === 0 ? (
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center">
                      <DollarSign className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-700">No Contributions Recorded</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                        No financial contributions or premium payments have been recorded for Member {selectedMember.saccoAccountNumber} ({selectedMember.fullName}).
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3">Receipt #</th>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3 text-right">Amount (UGX)</th>
                            <th className="py-2.5 px-3">Method</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Period Covered</th>
                            <th className="py-2.5 px-3">Officer & Branch</th>
                            <th className="py-2.5 px-3 text-center">Receipt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {memberContributions.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-950 text-[11px]">
                                {c.receiptNumber}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                {c.contributionDate}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                UGX {Number(c.amount || 0).toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800">
                                  {c.paymentMethod.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  c.status === 'CONFIRMED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : c.status === 'CORRECTED'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-600 whitespace-nowrap">
                                {c.periodCoveredStart && c.periodCoveredEnd
                                  ? `${c.periodCoveredStart} to ${c.periodCoveredEnd}`
                                  : 'Annual'}
                              </td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-600">
                                <div>{c.receivedByUsername || 'Staff'}</div>
                                <div className="text-[10px] text-slate-400">{c.branchName}</div>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedContributionForReceipt(c);
                                    setIsReceiptModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold text-[11px] transition"
                                  title="Print or view receipt"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  Receipt
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Renewal History */}
              {profileTab === 'renewals' && canViewRenewals && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b">
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-700" />
                      Plan Renewals & Policy History ({memberRenewals.length})
                    </h3>
                  </div>

                  {memberRenewals.length === 0 ? (
                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center">
                      <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-700">No Renewal Records</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                        No policy renewals have been recorded yet for SACCO Member {selectedMember.saccoAccountNumber}.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3">Renewal Reference</th>
                            <th className="py-2.5 px-3">Renewal Date</th>
                            <th className="py-2.5 px-3">Effective Date</th>
                            <th className="py-2.5 px-3">Previous Expiry</th>
                            <th className="py-2.5 px-3">New Expiry Date</th>
                            <th className="py-2.5 px-3 text-right">Fee (UGX)</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Officer & Branch</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {memberRenewals.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 px-3 font-mono font-bold text-blue-900 text-[11px]">
                                {r.renewalReference}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                {r.renewalDate}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                {r.effectiveDate}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                {r.previousExpiryDate || '—'}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-emerald-800 whitespace-nowrap">
                                {r.newExpiryDate}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                                {r.renewalFee ? `UGX ${r.renewalFee.toLocaleString()}` : '—'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  {r.renewalStatus}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-600">
                                <div>{r.processedByUsername || 'Staff'}</div>
                                <div className="text-[10px] text-slate-400">{r.branchName}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Claims History */}
              {profileTab === 'claims' && canViewClaims && (
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] pb-1 border-b flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-700" />
                    Claims & Benefit Disbursals
                  </h3>
                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 text-center">
                    <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">Claims History Record</p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                      No pending or processed claims found for Member {selectedMember.saccoAccountNumber}.
                    </p>
                  </div>
                </div>
              )}

              {/* Audit / Change History */}
              {profileTab === 'history' && canViewHistory && (
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] pb-1 border-b flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-blue-700" />
                    Immutable Audit & Change Trail
                  </h3>

                  {memberCorrections.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-amber-900 uppercase">
                        Audited Controlled Corrections ({memberCorrections.length})
                      </span>
                      {memberCorrections.map(c => (
                        <div key={c.id} className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs">
                          <div className="flex justify-between font-semibold text-amber-950">
                            <span>Field Corrected: {c.fieldChanged}</span>
                            <span className="font-mono text-[10px]">{c.timestamp}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 mt-1">
                            <span className="line-through text-slate-400 mr-2">{c.previousValue || '(empty)'}</span>
                            <span className="font-bold text-emerald-800">{c.newValue}</span>
                          </div>
                          <div className="text-[11px] text-amber-900 mt-1">
                            <strong>Reason:</strong> {c.reason}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Officer: {c.username} • Branch: {c.branchName}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-800 uppercase">
                      Audit Log Entries ({memberAuditHistory.length})
                    </span>
                    {memberAuditHistory.length === 0 ? (
                      <p className="text-slate-400 italic">No specific audit entries recorded yet.</p>
                    ) : (
                      memberAuditHistory.map(log => (
                        <div key={log.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                          <div className="flex justify-between items-center font-semibold text-slate-900">
                            <span className="font-mono text-blue-800 text-[11px]">{log.action}</span>
                            <span className="font-mono text-[10px] text-slate-400">{log.timestamp}</span>
                          </div>
                          <p className="text-[11px] text-slate-700 mt-1">
                            {log.newValue || log.previousValue || 'Operational transaction recorded'}
                          </p>
                          <div className="text-[10px] text-slate-500 mt-1">
                            User: {log.userFullName} ({log.username}) • Branch: {log.branchName}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-between items-center shrink-0">
              <span className="text-[11px] text-slate-500 font-mono">
                System Timestamp: {new Date().toISOString().split('T')[0]}
              </span>
              <div className="space-x-2">
                {canEdit && (
                  <button
                    onClick={() => openEditModal(selectedMember)}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                  >
                    {LocalRepository.isWithinFiveDaysWindow(selectedMember.registrationDate)
                      ? 'Edit Member'
                      : 'Controlled Correction'}
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => openDeleteConfirm(selectedMember)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                  >
                    Delete Member
                  </button>
                )}
                <button
                  onClick={() => setSelectedMember(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Normal Edit Modal (Within 5 Days) */}
      {showNormalEditModal && selectedMember && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden">
            <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-emerald-950">
                  Edit Member Record (Authorized 5-Day Window)
                </h2>
                <p className="text-[11px] text-emerald-700">
                  SACCO Account Number {selectedMember.saccoAccountNumber} is locked and cannot be changed.
                </p>
              </div>
              <button
                onClick={() => setShowNormalEditModal(false)}
                className="text-emerald-800 hover:text-emerald-950 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-white"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleNormalEdit} className="p-6 space-y-4 text-xs">
              {/* SACCO Account Number - Strictly non-editable */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  SACCO Account Number (Immutable Primary Key)
                </label>
                <input
                  type="text"
                  disabled
                  value={formData.saccoAccountNumber}
                  className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-lg font-mono font-bold text-slate-600 cursor-not-allowed uppercase"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Rule: SACCO account numbers can never be changed or regenerated by Turihamwe.
                </span>
              </div>

              {/* Personal Information Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                    required
                    className="w-full p-2 border rounded-lg bg-white text-slate-900"
                  />
                  {formErrors.fullName && <p className="text-[10px] text-red-600 mt-1">{formErrors.fullName}</p>}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gender *</label>
                  <select
                    value={formData.gender}
                    onChange={e => setFormData({ ...formData, gender: e.target.value as 'MALE' | 'FEMALE' | 'OTHER' })}
                    className="w-full p-2 border rounded-lg bg-white text-slate-900"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    required
                    className="w-full p-2 border rounded-lg bg-white text-slate-900"
                  />
                  {formErrors.dateOfBirth && <p className="text-[10px] text-red-600 mt-1">{formErrors.dateOfBirth}</p>}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">National ID (NIN) *</label>
                  <input
                    type="text"
                    value={formData.nationalIdNumber}
                    onChange={e => setFormData({ ...formData, nationalIdNumber: e.target.value.toUpperCase() })}
                    required
                    className="w-full p-2 border rounded-lg font-mono uppercase bg-white text-slate-900"
                  />
                  {formErrors.nationalIdNumber && (
                    <p className="text-[10px] text-red-600 mt-1">{formErrors.nationalIdNumber}</p>
                  )}
                </div>
              </div>

              {/* Contact Information Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Primary Phone Number *</label>
                  <input
                    type="tel"
                    value={formData.primaryPhone}
                    onChange={e => setFormData({ ...formData, primaryPhone: e.target.value })}
                    required
                    className="w-full p-2 border rounded-lg font-mono bg-white text-slate-900"
                  />
                  {formErrors.primaryPhone && <p className="text-[10px] text-red-600 mt-1">{formErrors.primaryPhone}</p>}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alternative Phone (Optional)</label>
                  <input
                    type="tel"
                    value={formData.alternativePhone}
                    onChange={e => setFormData({ ...formData, alternativePhone: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono bg-white text-slate-900"
                  />
                  {formErrors.alternativePhone && (
                    <p className="text-[10px] text-red-600 mt-1">{formErrors.alternativePhone}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  value={formData.emailAddress}
                  onChange={e => setFormData({ ...formData, emailAddress: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-white text-slate-900"
                />
                {formErrors.emailAddress && <p className="text-[10px] text-red-600 mt-1">{formErrors.emailAddress}</p>}
              </div>

              {/* Address Fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">District *</label>
                  <input
                    type="text"
                    value={formData.district}
                    onChange={e => setFormData({ ...formData, district: e.target.value })}
                    required
                    className="w-full p-2 border rounded-lg bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sub-county *</label>
                  <input
                    type="text"
                    value={formData.subCounty}
                    onChange={e => setFormData({ ...formData, subCounty: e.target.value })}
                    required
                    className="w-full p-2 border rounded-lg bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Parish *</label>
                  <input
                    type="text"
                    value={formData.parish}
                    onChange={e => setFormData({ ...formData, parish: e.target.value })}
                    required
                    className="w-full p-2 border rounded-lg bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Village *</label>
                  <input
                    type="text"
                    value={formData.village}
                    onChange={e => setFormData({ ...formData, village: e.target.value })}
                    required
                    className="w-full p-2 border rounded-lg bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowNormalEditModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs transition"
                >
                  Save Permitted Edits
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Controlled Correction Modal (Post 5-Day Lock) */}
      {showCorrectionModal && selectedMember && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="bg-amber-50 text-amber-950 border-b border-amber-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-600" />
                <div>
                  <h2 className="text-sm font-bold text-amber-950">Controlled Member Record Correction</h2>
                  <p className="text-[11px] text-amber-700">
                    Mandatory Audited Correction for Records Older Than 5 Days
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCorrectionModal(false)}
                className="text-amber-800 hover:text-amber-950 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-amber-200 bg-white"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleControlledCorrection} className="p-6 space-y-4 text-xs">
              <div className="bg-amber-50 p-3.5 rounded-lg border border-amber-200 text-amber-900 text-xs leading-relaxed">
                <strong>Five-Day Rule Enforcement:</strong> Direct overwriting is locked. This correction will be permanently logged in the audit trail with your identity, working branch, exact timestamp, old value, new value, and institutional justification.
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Member Account</label>
                <input
                  type="text"
                  disabled
                  value={`${selectedMember.fullName} (${selectedMember.saccoAccountNumber})`}
                  className="w-full p-2 bg-slate-100 border border-slate-300 rounded-lg font-mono text-slate-600 cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500">Authorized User:</span>
                  <div className="font-semibold text-slate-800">{user?.fullName} ({user?.username})</div>
                </div>
                <div>
                  <span className="text-slate-500">Working Branch:</span>
                  <div className="font-semibold text-slate-800">{workingBranch?.name}</div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Field to Correct *</label>
                <select
                  value={correctionField}
                  onChange={e => {
                    const field = e.target.value;
                    setCorrectionField(field);
                    const curVal = String((selectedMember as unknown as Record<string, unknown>)[field] ?? '');
                    setCorrectionValue(curVal);
                  }}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  <option value="primaryPhone">Primary Phone Number</option>
                  <option value="alternativePhone">Alternative Phone Number</option>
                  <option value="emailAddress">Email Address</option>
                  <option value="fullName">Full Legal Name</option>
                  <option value="nationalIdNumber">National ID (NIN)</option>
                  <option value="gender">Gender</option>
                  <option value="dateOfBirth">Date of Birth</option>
                  <option value="village">Village</option>
                  <option value="parish">Parish</option>
                  <option value="subCounty">Sub-County</option>
                  <option value="district">District</option>
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  SACCO Account Number and Registration Date are immutable and cannot be altered.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Current Registered Value</label>
                <input
                  type="text"
                  disabled
                  value={String((selectedMember as unknown as Record<string, unknown>)[correctionField] ?? '(None)')}
                  className="w-full p-2 bg-slate-100 border border-slate-300 rounded-lg font-mono text-slate-600 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Audited Value *</label>
                <input
                  type="text"
                  value={correctionValue}
                  onChange={e => setCorrectionValue(e.target.value)}
                  placeholder="Enter the new verified value"
                  required
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Justification / Audit Reason (Required) *
                </label>
                <textarea
                  value={correctionReason}
                  onChange={e => setCorrectionReason(e.target.value)}
                  placeholder="Enter a detailed explanation for this post-lock correction (e.g. member presented updated national identity card verified by Branch Manager)"
                  required
                  rows={3}
                  className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-semibold shadow-xs transition"
                >
                  Apply & Audit Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Registration Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 text-slate-900 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Register SACCO Member</h2>
                <p className="text-[11px] text-slate-500">
                  Nyamuyanja SACCO Ltd • Branch: {workingBranch?.name}
                </p>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-600 hover:text-slate-900 transition font-semibold text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleRegisterMember} className="p-6 space-y-4 text-xs">
              <div className="bg-blue-50 p-3.5 rounded-lg border border-blue-200 text-blue-900 text-xs leading-relaxed">
                <strong>Mandatory Specification Rules:</strong> The member's existing SACCO account number is the primary identifier. It must be unique, belongs to only one member, and is never generated or modified by Turihamwe.
              </div>

              {/* PERSONAL INFORMATION */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] pb-1 border-b">
                  Personal Information
                </h3>

                {/* SACCO Account Number */}
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    SACCO Account Number (Primary Identifier) *
                  </label>
                  <input
                    type="text"
                    value={formData.saccoAccountNumber}
                    onChange={e => setFormData({ ...formData, saccoAccountNumber: e.target.value.toUpperCase() })}
                    placeholder="e.g. NYA-001234"
                    required
                    className={`w-full p-2.5 border rounded-lg font-mono uppercase bg-white text-slate-900 tracking-wider ${
                      formErrors.saccoAccountNumber ? 'border-red-500' : 'border-slate-300'
                    }`}
                  />
                  {formErrors.saccoAccountNumber ? (
                    <p className="text-[10px] text-red-600 mt-1">{formErrors.saccoAccountNumber}</p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Must be the member's existing SACCO account number. Never auto-generated.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Full Legal Name *</label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="e.g. Kato Emmanuel"
                      required
                      className={`w-full p-2 border rounded-lg bg-white text-slate-900 ${
                        formErrors.fullName ? 'border-red-500' : 'border-slate-300'
                      }`}
                    />
                    {formErrors.fullName && <p className="text-[10px] text-red-600 mt-1">{formErrors.fullName}</p>}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Gender *</label>
                    <select
                      value={formData.gender}
                      onChange={e =>
                        setFormData({ ...formData, gender: e.target.value as 'MALE' | 'FEMALE' | 'OTHER' })
                      }
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Date of Birth *</label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      required
                      className={`w-full p-2 border rounded-lg bg-white text-slate-900 ${
                        formErrors.dateOfBirth ? 'border-red-500' : 'border-slate-300'
                      }`}
                    />
                    {formErrors.dateOfBirth && (
                      <p className="text-[10px] text-red-600 mt-1">{formErrors.dateOfBirth}</p>
                    )}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">
                      National ID / Identification Number *
                    </label>
                    <input
                      type="text"
                      value={formData.nationalIdNumber}
                      onChange={e => setFormData({ ...formData, nationalIdNumber: e.target.value.toUpperCase() })}
                      placeholder="e.g. CM85012345XYZ"
                      required
                      className={`w-full p-2 border rounded-lg font-mono uppercase bg-white text-slate-900 ${
                        formErrors.nationalIdNumber ? 'border-red-500' : 'border-slate-300'
                      }`}
                    />
                    {formErrors.nationalIdNumber && (
                      <p className="text-[10px] text-red-600 mt-1">{formErrors.nationalIdNumber}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* CONTACT INFORMATION */}
              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] pb-1 border-b">
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Primary Phone Number *</label>
                    <input
                      type="tel"
                      value={formData.primaryPhone}
                      onChange={e => setFormData({ ...formData, primaryPhone: e.target.value })}
                      placeholder="e.g. +256772123456"
                      required
                      className={`w-full p-2 border rounded-lg font-mono bg-white text-slate-900 ${
                        formErrors.primaryPhone ? 'border-red-500' : 'border-slate-300'
                      }`}
                    />
                    {formErrors.primaryPhone ? (
                      <p className="text-[10px] text-red-600 mt-1">{formErrors.primaryPhone}</p>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-1">Required for automated SMS notifications.</p>
                    )}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-800 mb-1">Alternative Phone (Optional)</label>
                    <input
                      type="tel"
                      value={formData.alternativePhone}
                      onChange={e => setFormData({ ...formData, alternativePhone: e.target.value })}
                      placeholder="+256750000000"
                      className="w-full p-2 border border-slate-300 rounded-lg font-mono bg-white text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Email Address (Optional)</label>
                  <input
                    type="email"
                    value={formData.emailAddress}
                    onChange={e => setFormData({ ...formData, emailAddress: e.target.value })}
                    placeholder="member@example.com"
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                  />
                  {formErrors.emailAddress && (
                    <p className="text-[10px] text-red-600 mt-1">{formErrors.emailAddress}</p>
                  )}
                </div>
              </div>

              {/* ADDRESS */}
              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] pb-1 border-b">
                  Address
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">District *</label>
                    <input
                      type="text"
                      value={formData.district}
                      onChange={e => setFormData({ ...formData, district: e.target.value })}
                      required
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Sub-county *</label>
                    <input
                      type="text"
                      value={formData.subCounty}
                      onChange={e => setFormData({ ...formData, subCounty: e.target.value })}
                      required
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Parish *</label>
                    <input
                      type="text"
                      value={formData.parish}
                      onChange={e => setFormData({ ...formData, parish: e.target.value })}
                      required
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Village *</label>
                    <input
                      type="text"
                      value={formData.village}
                      onChange={e => setFormData({ ...formData, village: e.target.value })}
                      required
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* VITAL CLIENT STATUS */}
              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] pb-1 border-b">
                  Vital Client Status (Specification Requirement)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      regClientStatus === 'ALIVE'
                        ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/30'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="regClientStatus"
                      value="ALIVE"
                      checked={regClientStatus === 'ALIVE'}
                      onChange={() => setRegClientStatus('ALIVE')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block text-xs">ALIVE (Standard Active Member)</span>
                      <span className="text-[11px] text-slate-500">
                        Client is alive, operational, and in regular standing with Nyamuyanja SACCO.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      regClientStatus === 'DECEASED'
                        ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/30'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="regClientStatus"
                      value="DECEASED"
                      checked={regClientStatus === 'DECEASED'}
                      onChange={() => setRegClientStatus('DECEASED')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block text-xs">DECEASED (Recorded Deceased)</span>
                      <span className="text-[11px] text-slate-500">
                        Client is confirmed deceased. Historical data and claims records are preserved.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* BENEFICIARIES REGISTRATION */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between pb-1 border-b">
                  <div>
                    <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                      Beneficiary Enrolment (Optional, Multiple Allowed)
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      Enrol family beneficiaries during member registration. Future dates of birth are strictly rejected.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRegBeneficiaries(prev => [
                        ...prev,
                        {
                          fullName: '',
                          dateOfBirth: '',
                          relationship: 'Spouse',
                          nationalIdNumber: '',
                          contactPhone: '',
                        },
                      ]);
                    }}
                    className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
                  >
                    + Add Beneficiary
                  </button>
                </div>

                {regBeneficiaries.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center text-slate-500 text-[11px]">
                    No beneficiaries added yet. Click <strong>+ Add Beneficiary</strong> to record scheme beneficiaries now, or add them later.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {regBeneficiaries.map((b, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 relative">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-slate-700">Beneficiary #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setRegBeneficiaries(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="text-red-600 hover:text-red-800 text-[11px] font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              Full Legal Name *
                            </label>
                            <input
                              type="text"
                              value={b.fullName}
                              onChange={e => {
                                const val = e.target.value;
                                setRegBeneficiaries(prev =>
                                  prev.map((item, i) => (i === idx ? { ...item, fullName: val } : item))
                                );
                              }}
                              placeholder="e.g. Tumwine Sarah"
                              required
                              className="w-full p-1.5 border border-slate-300 rounded bg-white text-slate-900 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              Relationship *
                            </label>
                            <select
                              value={b.relationship}
                              onChange={e => {
                                const val = e.target.value;
                                setRegBeneficiaries(prev =>
                                  prev.map((item, i) => (i === idx ? { ...item, relationship: val } : item))
                                );
                              }}
                              className="w-full p-1.5 border border-slate-300 rounded bg-white text-slate-900 text-xs"
                            >
                              <option value="Spouse">Spouse</option>
                              <option value="Child">Child</option>
                              <option value="Parent">Parent</option>
                              <option value="Sibling">Sibling</option>
                              <option value="Relative">Relative</option>
                              <option value="Dependent">Dependent</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              Date of Birth *
                            </label>
                            <input
                              type="date"
                              value={b.dateOfBirth}
                              max={new Date().toISOString().split('T')[0]}
                              onChange={e => {
                                const val = e.target.value;
                                setRegBeneficiaries(prev =>
                                  prev.map((item, i) => (i === idx ? { ...item, dateOfBirth: val } : item))
                                );
                              }}
                              required
                              className="w-full p-1.5 border border-slate-300 rounded bg-white text-slate-900 text-xs"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              National ID (Optional)
                            </label>
                            <input
                              type="text"
                              value={b.nationalIdNumber || ''}
                              onChange={e => {
                                const val = e.target.value.toUpperCase();
                                setRegBeneficiaries(prev =>
                                  prev.map((item, i) => (i === idx ? { ...item, nationalIdNumber: val } : item))
                                );
                              }}
                              placeholder="e.g. CF90012345XYZ"
                              className="w-full p-1.5 border border-slate-300 rounded bg-white text-slate-900 text-xs font-mono uppercase"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                              Contact Phone (Optional)
                            </label>
                            <input
                              type="tel"
                              value={b.contactPhone || ''}
                              onChange={e => {
                                const val = e.target.value;
                                setRegBeneficiaries(prev =>
                                  prev.map((item, i) => (i === idx ? { ...item, contactPhone: val } : item))
                                );
                              }}
                              placeholder="+256700000000"
                              className="w-full p-1.5 border border-slate-300 rounded bg-white text-slate-900 text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SYSTEM INFORMATION (Branch Rule Enforcement) */}
              <div className="space-y-3 pt-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] pb-1 border-b border-slate-200">
                  System Information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Registering Branch *</label>
                    {!user?.hasMultiBranchAccess ? (
                      <div>
                        <input
                          type="text"
                          disabled
                          value={workingBranch?.name || 'Nyamuyanja Branch'}
                          className="w-full p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-600 cursor-not-allowed font-medium"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Assigned branch (Non-editable for single-branch staff)
                        </span>
                      </div>
                    ) : (
                      <div>
                        <select
                          value={formData.branchId || workingBranch?.id}
                          onChange={e => setFormData({ ...formData, branchId: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900"
                        >
                          {allowedBranches.map((b: Branch) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-blue-700 mt-1 block">
                          Authorized Multi-Branch Access active
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Registration Date</label>
                    <input
                      type="text"
                      disabled
                      value={formData.registrationDate}
                      className="w-full p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-600 font-mono cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-500 pt-1">
                  <div>
                    Created By: <strong className="text-slate-800">{user?.fullName} ({user?.username})</strong>
                  </div>
                  <div>
                    System Time: <strong className="text-slate-800">{new Date().toLocaleTimeString()}</strong>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-xs transition"
                >
                  Complete Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Administrator Member Deletion Confirmation Modal */}
      {showDeleteModal && memberToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-700 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-900 uppercase tracking-wide">Administrator Deletion Confirmation</h3>
                <p className="text-xs text-red-700">Strict SACCO security verification</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800 space-y-1.5">
                <div><span className="font-semibold text-slate-600">Member Name:</span> <strong className="text-slate-900">{memberToDelete.fullName}</strong></div>
                <div><span className="font-semibold text-slate-600">SACCO Account:</span> <strong className="font-mono text-blue-700">{memberToDelete.saccoAccountNumber}</strong></div>
                <div><span className="font-semibold text-slate-600">Branch:</span> {memberToDelete.branchName || 'Assigned Branch'}</div>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                Are you sure you want to delete this member record? This action requires administrator authorization.
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Referential integrity will be enforced: related historical records, Turihamwe policies, and audit transactions will be safely preserved under institutional deactivation controls.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Deletion / Deactivation <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Provide mandatory administrative justification for immutable audit logs..."
                  className="w-full h-20 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-slate-800"
                  required
                />
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setMemberToDelete(null);
                  setDeleteReason('');
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting || !deleteReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Authorizing Deletion...
                  </>
                ) : (
                  'Confirm & Delete Member'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Status Update Modal (ALIVE / DECEASED) */}
      {showStatusModal && statusTargetMember && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-700" />
                <h3 className="text-sm font-bold text-slate-900">Update Client Status</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowStatusModal(false);
                  setStatusTargetMember(null);
                  setClientStatusReason('');
                }}
                className="text-slate-500 hover:text-slate-800 text-xs font-semibold px-2 py-1 rounded"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleUpdateClientStatusSubmit} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div><span className="text-slate-500">Member:</span> <strong className="text-slate-900">{statusTargetMember.fullName}</strong></div>
                <div><span className="text-slate-500">SACCO Account:</span> <strong className="font-mono text-blue-700">{statusTargetMember.saccoAccountNumber}</strong></div>
                <div>
                  <span className="text-slate-500">Current Status:</span>{' '}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${(statusTargetMember.clientStatus || 'ALIVE') === 'ALIVE' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
                    {statusTargetMember.clientStatus || 'ALIVE'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-2">
                  New Client Vital Status *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition ${
                      newClientStatus === 'ALIVE'
                        ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="newClientStatus"
                      value="ALIVE"
                      checked={newClientStatus === 'ALIVE'}
                      onChange={() => setNewClientStatus('ALIVE')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-bold text-slate-900 text-xs">ALIVE</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition ${
                      newClientStatus === 'DECEASED'
                        ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="newClientStatus"
                      value="DECEASED"
                      checked={newClientStatus === 'DECEASED'}
                      onChange={() => setNewClientStatus('DECEASED')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span className="font-bold text-slate-900 text-xs">DECEASED</span>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Note: Marking a client DECEASED preserves all historical records, claims, plans, and audit trails. No data is physically deleted.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Mandatory Audit Reason / Justification *
                </label>
                <textarea
                  value={clientStatusReason}
                  onChange={e => setClientStatusReason(e.target.value)}
                  placeholder="e.g. Verified death notification certificate submitted by family member / Chief of Nyamuyanja"
                  required
                  rows={3}
                  className="w-full p-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusModal(false);
                    setStatusTargetMember(null);
                    setClientStatusReason('');
                  }}
                  disabled={isUpdatingStatus}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingStatus || !clientStatusReason.trim()}
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {isUpdatingStatus ? 'Saving Status...' : 'Apply Status Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contribution Receipt Modal */}
      <ContributionReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setSelectedContributionForReceipt(null);
        }}
        contribution={selectedContributionForReceipt}
      />
    </div>
  );
};
