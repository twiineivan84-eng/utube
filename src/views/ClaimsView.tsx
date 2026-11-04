import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { apiClient } from '../api/client';
import { LocalRepository } from '../db/local/localRepository';
import { localDb } from '../db/local/sqliteEngine';
import { notifyRecordChanged, subscribeToRecordChanges } from '../utils/systemEvents';
import {
  TurihamweClaim,
  ClaimStatus,
  ClaimCategory,
  DocumentCategory,
  ClaimDocument,
  SaccoMember,
  TurihamwePlan,
  Beneficiary
} from '../types';
import {
  FileCheck2,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  AlertCircle,
  Shield,
  Upload,
  ArrowRight,
  Search,
  Filter,
  Eye,
  Download,
  AlertTriangle,
  Calendar,
  User as UserIcon,
  Building,
  Check,
  X,
  CreditCard,
  RefreshCw,
  FileSpreadsheet,
  ChevronRight,
  Info,
  Lock,
  Layers
} from 'lucide-react';

export const ClaimsView: React.FC = () => {
  const { user, workingBranch, hasPermission } = useAuth();
  const { isOnline } = useSync();

  // Permissions
  const canView = hasPermission('claims.view');
  const canCreate = hasPermission('claims.create');
  const canEdit = hasPermission('claims.edit');
  const canUpload = hasPermission('claims.upload_documents');
  const canReview = hasPermission('claims.review');
  const canRequestDocs = hasPermission('claims.request_documents');
  const canApprove = hasPermission('claims.approve');
  const canReject = hasPermission('claims.reject');
  const canClose = hasPermission('claims.close');
  const canViewHistory = hasPermission('claims.view_history');
  const canViewPayment = hasPermission('claims.view_payment_info') ||
    user?.roleId === 'role-gm' ||
    user?.roleId === 'role-bm' ||
    user?.roleId === 'role-accounts' ||
    user?.roleId === 'role-auditor';

  // State
  const [claims, setClaims] = useState<TurihamweClaim[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTION_REQUIRED' | 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'AWAITING_DOCUMENTS' | 'APPROVED' | 'REJECTED' | 'CLOSED'>('ALL');
  
  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterBranchId, setFilterBranchId] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  
  // Detail Modal / Selected Claim
  const [selectedClaim, setSelectedClaim] = useState<TurihamweClaim | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'documents' | 'review_actions' | 'history' | 'business_rules'>('overview');

  // New Claim Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [memberSearchResults, setMemberSearchResults] = useState<SaccoMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<SaccoMember | null>(null);
  const [memberPlan, setMemberPlan] = useState<TurihamwePlan | null>(null);
  const [planBeneficiaries, setPlanBeneficiaries] = useState<Beneficiary[]>([]);
  const [formBeneficiaryId, setFormBeneficiaryId] = useState<string>('');
  const [formCategory, setFormCategory] = useState<ClaimCategory>('DEATH_OF_MEMBER');
  const [formIncidentDate, setFormIncidentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formIncidentDescription, setFormIncidentDescription] = useState<string>('');
  const [formInitialStatus, setFormInitialStatus] = useState<'DRAFT' | 'SUBMITTED'>('SUBMITTED');
  
  // Duplicate Claim Warning
  const [duplicateWarning, setDuplicateWarning] = useState<{
    detected: boolean;
    duplicateClaims: TurihamweClaim[];
  }>({ detected: false, duplicateClaims: [] });
  const [duplicateOverrideJustification, setDuplicateOverrideJustification] = useState<string>('');
  const [isSubmittingNewClaim, setIsSubmittingNewClaim] = useState<boolean>(false);

  // Review Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [reviewActionType, setReviewActionType] = useState<'UNDER_REVIEW' | 'AWAITING_DOCUMENTS'>('UNDER_REVIEW');
  const [requestedDocsText, setRequestedDocsText] = useState<string>('');

  // Approval / Rejection Modal State
  const [isApproveModalOpen, setIsApproveModalOpen] = useState<boolean>(false);
  const [approvalReference, setApprovalReference] = useState<string>('');
  const [approvalNotes, setApprovalNotes] = useState<string>('');

  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectionNotes, setRejectionNotes] = useState<string>('');

  // Payment Recording Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Document Upload Modal State
  const [isUploadDocModalOpen, setIsUploadDocModalOpen] = useState<boolean>(false);
  const [docCategory, setDocCategory] = useState<DocumentCategory>('DEATH_CERTIFICATE');
  const [docTitle, setDocTitle] = useState<string>('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docFileDataUrl, setDocFileDataUrl] = useState<string>('');
  const [docNotes, setDocNotes] = useState<string>('');
  const [docReplacedId, setDocReplacedId] = useState<string>('');
  const [docReplacementReason, setDocReplacementReason] = useState<string>('');
  const [docUploadError, setDocUploadError] = useState<string>('');

  // Preview Document Modal
  const [previewDoc, setPreviewDoc] = useState<ClaimDocument | null>(null);

  // Load claims
  const fetchClaims = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const res = await apiClient.getClaims({
          branchId: filterBranchId || undefined,
          status: activeTab === 'ACTION_REQUIRED' ? undefined : (activeTab === 'ALL' ? undefined : activeTab),
          searchQuery: searchQuery || undefined,
          startDate: filterStartDate || undefined,
          endDate: filterEndDate || undefined,
        });
        if (res.success) {
          setClaims(res.data);
          // Sync into local DB for offline access
          for (const c of res.data) {
            await localDb.claims.put(c);
          }
        }
      } else {
        const localClaims = await LocalRepository.getClaimsLocally({
          branchId: filterBranchId || undefined,
          status: activeTab === 'ACTION_REQUIRED' ? undefined : (activeTab === 'ALL' ? undefined : activeTab),
          searchQuery: searchQuery || undefined,
        });
        setClaims(localClaims);
      }
    } catch (err) {
      console.error('Failed to load claims, loading local fallback:', err);
      const localClaims = await LocalRepository.getClaimsLocally({
        branchId: filterBranchId || undefined,
        searchQuery: searchQuery || undefined,
      });
      setClaims(localClaims);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [isOnline, activeTab, filterBranchId, filterStartDate, filterEndDate]);

  // Subscribe to system-wide record changes so edits to members, plans, or claims reflect immediately
  useEffect(() => {
    const unsubscribe = subscribeToRecordChanges((event) => {
      if (['MEMBER', 'PLAN', 'CLAIM'].includes(event.entityType)) {
        fetchClaims();
      }
    });
    return unsubscribe;
  }, []);

  // Handle member search during new claim creation
  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = memberSearch.trim();
      if (!q) {
        setMemberSearchResults([]);
        return;
      }
      try {
        // STRICT SACCO RULE: Member search ONLY by account number or name
        if (isOnline) {
          const res = await apiClient.searchMembers(q);
          if (res.success) setMemberSearchResults(res.data);
        } else {
          const results = await LocalRepository.searchMembers(q);
          setMemberSearchResults(results);
        }
      } catch {
        setMemberSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch, isOnline]);

  // Load member's active plan when selected
  const handleSelectMember = async (member: SaccoMember) => {
    setSelectedMember(member);
    setMemberSearch(`${member.saccoAccountNumber} - ${member.fullName}`);
    setMemberSearchResults([]);
    setDuplicateWarning({ detected: false, duplicateClaims: [] });

    try {
      let plan: TurihamwePlan | null = null;
      if (isOnline) {
        const planRes = await apiClient.getMemberByAccount(member.saccoAccountNumber);
        // Look up plan
        const plansRes = await apiClient.getPlans(member.saccoAccountNumber);
        if (plansRes.success && plansRes.data.length > 0) {
          plan = plansRes.data[0];
        }
      } else {
        const localP = await LocalRepository.getPlanByAccount(member.saccoAccountNumber);
        plan = localP || null;
      }
      setMemberPlan(plan);

      if (plan) {
        // Load beneficiaries
        if (isOnline) {
          const bRes = await apiClient.getBeneficiaries(plan.id);
          if (bRes.success) setPlanBeneficiaries(bRes.data);
        } else {
          const bens = await localDb.beneficiaries.where('planId').equals(plan.id).toArray();
          setPlanBeneficiaries(bens);
        }

        // Pre-check for duplicate claims
        checkDuplicates(member.saccoAccountNumber, plan.id, formBeneficiaryId);
      } else {
        setPlanBeneficiaries([]);
      }
    } catch {
      setMemberPlan(null);
      setPlanBeneficiaries([]);
    }
  };

  // Check duplicate claims
  const checkDuplicates = async (accountNumber: string, planId: string, beneficiaryId?: string) => {
    try {
      if (isOnline) {
        const res = await apiClient.checkDuplicateClaims({
          saccoAccountNumber: accountNumber,
          planId,
          beneficiaryId,
        });
        if (res.success && res.hasPotentialDuplicates) {
          setDuplicateWarning({
            detected: true,
            duplicateClaims: res.duplicateClaims,
          });
        } else {
          setDuplicateWarning({ detected: false, duplicateClaims: [] });
        }
      } else {
        const dups = await LocalRepository.checkPotentialDuplicateClaimsLocally({
          saccoAccountNumber: accountNumber,
          planId,
          beneficiaryId,
        });
        setDuplicateWarning({
          detected: dups.length > 0,
          duplicateClaims: dups,
        });
      }
    } catch {
      setDuplicateWarning({ detected: false, duplicateClaims: [] });
    }
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = claims.length;
    const draft = claims.filter(c => c.status === 'DRAFT').length;
    const submitted = claims.filter(c => c.status === 'SUBMITTED').length;
    const underReview = claims.filter(c => c.status === 'UNDER_REVIEW').length;
    const awaitingDocuments = claims.filter(c => c.status === 'AWAITING_DOCUMENTS').length;
    const approved = claims.filter(c => c.status === 'APPROVED').length;
    const rejected = claims.filter(c => c.status === 'REJECTED').length;
    const closed = claims.filter(c => c.status === 'CLOSED').length;
    const requiringAction = submitted + underReview + awaitingDocuments;

    return {
      total,
      draft,
      submitted,
      underReview,
      awaitingDocuments,
      approved,
      rejected,
      closed,
      requiringAction,
    };
  }, [claims]);

  // Filtered claims for display
  const displayedClaims = useMemo(() => {
    return claims.filter(c => {
      if (activeTab === 'ACTION_REQUIRED') {
        return ['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_DOCUMENTS'].includes(c.status);
      }
      if (activeTab !== 'ALL' && c.status !== activeTab) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRef = c.claimReference.toLowerCase().includes(q);
        const matchesAccount = c.saccoAccountNumber.toLowerCase().includes(q);
        const matchesName = c.memberName.toLowerCase().includes(q);
        if (!matchesRef && !matchesAccount && !matchesName) return false;
      }
      return true;
    });
  }, [claims, activeTab, searchQuery]);

  // Handle Create Claim submission
  const handleSubmitNewClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !memberPlan) {
      alert('Please select an active SACCO member with an active Turihamwe plan.');
      return;
    }

    if (duplicateWarning.detected && !duplicateOverrideJustification.trim()) {
      alert('A potential duplicate claim was detected. You must provide a formal override justification to proceed.');
      return;
    }

    setIsSubmittingNewClaim(true);
    try {
      const claimPayload = {
        saccoAccountNumber: selectedMember.saccoAccountNumber,
        planId: memberPlan.id,
        beneficiaryId: formBeneficiaryId || undefined,
        claimCategory: formCategory,
        incidentDate: formIncidentDate,
        incidentDescription: formIncidentDescription,
        initialStatus: formInitialStatus,
        duplicateWarningAcknowledged: duplicateWarning.detected,
        duplicateOverrideReason: duplicateWarning.detected ? duplicateOverrideJustification.trim() : undefined,
      };

      if (isOnline) {
        const res = await apiClient.createClaim(claimPayload);
        if (res.success && res.data) {
          alert(`Claim docket ${res.data.claimReference} filed successfully.`);
          setIsNewModalOpen(false);
          resetNewForm();
          fetchClaims();
          setSelectedClaim(res.data);
        } else if (res.requiresAcknowledgement) {
          setDuplicateWarning({
            detected: true,
            duplicateClaims: res.duplicateClaims || [],
          });
        } else {
          alert(res.error || 'Failed to file claim.');
        }
      } else {
        // Offline claim creation
        const branchCodePrefix = (workingBranch?.code || 'SACCO').substring(0, 3).toUpperCase();
        const year = new Date().getFullYear();
        const seq = String(Date.now()).slice(-4);
        const claimReference = `CLM-${branchCodePrefix}-${year}-${seq}`;

        let benName: string | undefined;
        let benRel: string | undefined;
        if (formBeneficiaryId) {
          const b = planBeneficiaries.find(item => item.id === formBeneficiaryId);
          if (b) {
            benName = b.fullName;
            benRel = b.relationship;
          }
        }

        const localClaim: TurihamweClaim = {
          id: `clm-off-${Date.now()}`,
          claimReference,
          saccoAccountNumber: selectedMember.saccoAccountNumber,
          memberName: selectedMember.fullName,
          planId: memberPlan.id,
          planCode: memberPlan.planCode,
          beneficiaryId: formBeneficiaryId || undefined,
          beneficiaryName: benName,
          beneficiaryRelationship: benRel,
          branchId: workingBranch?.id || 'branch-1',
          branchName: workingBranch?.name || 'Operating Branch',
          claimDate: new Date().toISOString().split('T')[0],
          status: formInitialStatus,
          claimCategory: formCategory,
          incidentDate: formIncidentDate,
          incidentDescription: formIncidentDescription,
          preparerUserId: user?.id || 'usr-local',
          preparerUsername: user?.username || 'user',
          preparerFullName: user?.fullName || 'User',
          supportingDocuments: [],
          reviewHistory: [],
          duplicateWarningAcknowledged: duplicateWarning.detected,
          duplicateOverrideReason: duplicateWarning.detected ? duplicateOverrideJustification.trim() : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await LocalRepository.createClaimLocally(localClaim);
        alert(`Claim docket ${localClaim.claimReference} saved locally in offline queue.`);
        setIsNewModalOpen(false);
        resetNewForm();
        fetchClaims();
        setSelectedClaim(localClaim);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error filing claim docket.');
    } finally {
      setIsSubmittingNewClaim(false);
    }
  };

  const resetNewForm = () => {
    setSelectedMember(null);
    setMemberPlan(null);
    setMemberSearch('');
    setPlanBeneficiaries([]);
    setFormBeneficiaryId('');
    setFormCategory('DEATH_OF_MEMBER');
    setFormIncidentDate(new Date().toISOString().split('T')[0]);
    setFormIncidentDescription('');
    setDuplicateWarning({ detected: false, duplicateClaims: [] });
    setDuplicateOverrideJustification('');
  };

  // Handle Review action
  const handleReviewSubmit = async () => {
    if (!selectedClaim) return;
    if (!reviewNotes.trim()) {
      alert('Review notes are required.');
      return;
    }

    try {
      const requestedList = requestedDocsText
        ? requestedDocsText.split('\n').map(s => s.trim()).filter(Boolean)
        : [];

      const payload = {
        reviewNotes: reviewNotes.trim(),
        newStatus: reviewActionType,
        requestedDocuments: reviewActionType === 'AWAITING_DOCUMENTS' ? requestedList : undefined,
      };

      if (isOnline) {
        const res = await apiClient.reviewClaim(selectedClaim.id, payload);
        if (res.success && res.data) {
          setSelectedClaim(res.data);
          alert('Claim review recorded successfully.');
          setIsReviewModalOpen(false);
          setReviewNotes('');
          setRequestedDocsText('');
          fetchClaims();
        } else {
          alert(res.error || 'Failed to record review.');
        }
      } else {
        const reviewRecord = {
          id: `rev-off-${Date.now()}`,
          claimId: selectedClaim.id,
          reviewerUserId: user?.id || 'usr-off',
          reviewerUsername: user?.username || 'user',
          reviewerFullName: user?.fullName || 'User',
          branchId: workingBranch?.id || selectedClaim.branchId,
          branchName: workingBranch?.name || selectedClaim.branchName,
          reviewDate: new Date().toISOString(),
          reviewNotes: reviewNotes.trim(),
          statusAssigned: reviewActionType,
          requestedDocuments: reviewActionType === 'AWAITING_DOCUMENTS' ? requestedList : undefined,
          createdAt: new Date().toISOString(),
        };

        const updated = await LocalRepository.addClaimReviewLocally(selectedClaim.id, reviewRecord, reviewActionType);
        setSelectedClaim(updated);
        alert('Claim review stored in offline sync queue.');
        setIsReviewModalOpen(false);
        setReviewNotes('');
        setRequestedDocsText('');
        fetchClaims();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error submitting review');
    }
  };

  // Handle Approval
  const handleApproveSubmit = async () => {
    if (!selectedClaim) return;

    // Separation of duties check
    if (selectedClaim.preparerUserId === user?.id && user?.roleId !== 'role-gm') {
      alert('Separation of Duties Enforced: Claim preparer cannot approve their own claim docket. Requires independent supervisory approval by Branch Manager or GM.');
      return;
    }

    try {
      if (isOnline) {
        const res = await apiClient.approveClaim(selectedClaim.id, {
          approvalReference: approvalReference.trim() || undefined,
          approvalNotes: approvalNotes.trim() || undefined,
        });
        if (res.success && res.data) {
          setSelectedClaim(res.data);
          alert(`Claim ${res.data.claimReference} approved successfully.`);
          setIsApproveModalOpen(false);
          setApprovalReference('');
          setApprovalNotes('');
          fetchClaims();
        } else {
          alert(res.error || 'Approval failed.');
        }
      } else {
        const approvalRecord = {
          decision: 'APPROVED' as const,
          decidedByUserId: user?.id || 'usr-off',
          decidedByUsername: user?.username || 'user',
          decidedByFullName: user?.fullName || 'User',
          branchId: workingBranch?.id || selectedClaim.branchId,
          branchName: workingBranch?.name || selectedClaim.branchName,
          decisionDate: new Date().toISOString(),
          reasonOrReference: approvalReference.trim() || `APP-OFF-${Date.now().toString().slice(-4)}`,
          decisionNotes: approvalNotes.trim() || '',
        };
        const updated = await LocalRepository.approveClaimLocally(selectedClaim.id, approvalRecord);
        setSelectedClaim(updated);
        alert(`Claim approved in offline mode. Reference: ${approvalRecord.reasonOrReference}`);
        setIsApproveModalOpen(false);
        setApprovalReference('');
        setApprovalNotes('');
        fetchClaims();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error approving claim');
    }
  };

  // Handle Rejection
  const handleRejectSubmit = async () => {
    if (!selectedClaim) return;
    if (!rejectionReason.trim()) {
      alert('Formal rejection reason is mandatory.');
      return;
    }

    try {
      if (isOnline) {
        const res = await apiClient.rejectClaim(selectedClaim.id, {
          rejectionReason: rejectionReason.trim(),
          rejectionNotes: rejectionNotes.trim() || undefined,
        });
        if (res.success && res.data) {
          setSelectedClaim(res.data);
          alert(`Claim ${res.data.claimReference} rejected. Reason logged in audit trail.`);
          setIsRejectModalOpen(false);
          setRejectionReason('');
          setRejectionNotes('');
          fetchClaims();
        } else {
          alert(res.error || 'Rejection failed.');
        }
      } else {
        const rejectionRecord = {
          decision: 'REJECTED' as const,
          decidedByUserId: user?.id || 'usr-off',
          decidedByUsername: user?.username || 'user',
          decidedByFullName: user?.fullName || 'User',
          branchId: workingBranch?.id || selectedClaim.branchId,
          branchName: workingBranch?.name || selectedClaim.branchName,
          decisionDate: new Date().toISOString(),
          reasonOrReference: rejectionReason.trim(),
          decisionNotes: rejectionNotes.trim() || '',
        };
        const updated = await LocalRepository.rejectClaimLocally(selectedClaim.id, rejectionRecord);
        setSelectedClaim(updated);
        alert('Claim rejection recorded in offline queue.');
        setIsRejectModalOpen(false);
        setRejectionReason('');
        setRejectionNotes('');
        fetchClaims();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error rejecting claim');
    }
  };

  // Handle Payment recording
  const handlePaymentSubmit = async () => {
    if (!selectedClaim) return;
    if (!paymentReference.trim()) {
      alert('Payment / voucher reference is mandatory.');
      return;
    }

    try {
      if (isOnline) {
        const res = await apiClient.recordClaimPayment(selectedClaim.id, {
          paymentReference: paymentReference.trim(),
          paymentDate,
          disbursementNotes: paymentNotes.trim() || undefined,
        });
        if (res.success && res.data) {
          setSelectedClaim(res.data);
          alert(`Payment reference ${paymentReference} recorded. Claim closed.`);
          setIsPaymentModalOpen(false);
          setPaymentReference('');
          setPaymentNotes('');
          fetchClaims();
        } else {
          alert(res.error || 'Payment recording failed.');
        }
      } else {
        const payInfo = {
          paymentReference: paymentReference.trim(),
          paymentDate,
          disbursementNotes: paymentNotes.trim() || '',
          recordedByUserId: user?.id || 'usr-off',
          recordedByUsername: user?.username || 'user',
          recordedAt: new Date().toISOString(),
        };
        const updated = await LocalRepository.recordClaimPaymentLocally(
          selectedClaim.id,
          payInfo,
          workingBranch?.id || selectedClaim.branchId,
          workingBranch?.name || selectedClaim.branchName
        );
        setSelectedClaim(updated);
        alert(`Payment reference recorded offline. Claim docket closed.`);
        setIsPaymentModalOpen(false);
        setPaymentReference('');
        setPaymentNotes('');
        fetchClaims();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error recording payment');
    }
  };

  // Handle Document upload
  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (< 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setDocUploadError('File size exceeds maximum permitted limit of 10MB.');
      setDocFile(null);
      return;
    }

    // Validate unsafe extensions
    const unsafe = ['.exe', '.bat', '.cmd', '.sh', '.php', '.js', '.vbs', '.py'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (unsafe.includes(ext)) {
      setDocUploadError('File type rejected for security compliance. Only documents and images are permitted.');
      setDocFile(null);
      return;
    }

    setDocUploadError('');
    setDocFile(file);
    if (!docTitle) {
      setDocTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    }

    // Read preview
    const reader = new FileReader();
    reader.onload = () => {
      setDocFileDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim || !docFile) {
      alert('Please select a valid document file to attach.');
      return;
    }

    try {
      const docPayload = {
        documentCategory: docCategory,
        documentTitle: docTitle.trim() || docFile.name,
        originalFileName: docFile.name,
        fileSize: docFile.size,
        mimeType: docFile.type || 'application/octet-stream',
        fileDataUrl: docFileDataUrl || undefined,
        replacedById: docReplacedId || undefined,
        replacementReason: docReplacedId ? docReplacementReason.trim() : undefined,
        notes: docNotes.trim() || undefined,
      };

      if (isOnline) {
        const res = await apiClient.uploadClaimDocument(selectedClaim.id, docPayload);
        if (res.success && res.data) {
          // Refresh claim details
          const refreshed = await apiClient.getClaimById(selectedClaim.id);
          if (refreshed.success) setSelectedClaim(refreshed.data);
          alert(`Document '${docPayload.documentTitle}' attached to claim docket.`);
          setIsUploadDocModalOpen(false);
          resetDocUploadForm();
          fetchClaims();
        } else {
          alert(res.error || 'Failed to upload document.');
        }
      } else {
        const newDoc: ClaimDocument = {
          id: `doc-off-${Date.now()}`,
          claimId: selectedClaim.id,
          documentCategory: docCategory,
          documentTitle: docTitle.trim() || docFile.name,
          originalFileName: docFile.name,
          fileSize: docFile.size,
          mimeType: docFile.type || 'application/octet-stream',
          fileDataUrl: docFileDataUrl,
          uploadedByUserId: user?.id || 'usr-off',
          uploadedByUsername: user?.username || 'user',
          uploadedByUserFullName: user?.fullName || 'User',
          branchId: workingBranch?.id || selectedClaim.branchId,
          branchName: workingBranch?.name || selectedClaim.branchName,
          uploadedAt: new Date().toISOString(),
          status: 'VALID',
          version: selectedClaim.supportingDocuments.filter(d => d.documentCategory === docCategory).length + 1,
          replacedById: docReplacedId || undefined,
          replacementReason: docReplacedId ? docReplacementReason.trim() : undefined,
          notes: docNotes.trim() || undefined,
        };

        await LocalRepository.addClaimDocumentLocally(selectedClaim.id, newDoc);
        const refreshed = await LocalRepository.getClaimByIdLocally(selectedClaim.id);
        if (refreshed) setSelectedClaim(refreshed);
        alert(`Document '${newDoc.documentTitle}' attached locally in offline sync queue.`);
        setIsUploadDocModalOpen(false);
        resetDocUploadForm();
        fetchClaims();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error attaching document');
    }
  };

  const resetDocUploadForm = () => {
    setDocCategory('DEATH_CERTIFICATE');
    setDocTitle('');
    setDocFile(null);
    setDocFileDataUrl('');
    setDocNotes('');
    setDocReplacedId('');
    setDocReplacementReason('');
    setDocUploadError('');
  };

  const getStatusBadge = (status: ClaimStatus) => {
    switch (status) {
      case 'DRAFT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">DRAFT</span>;
      case 'SUBMITTED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">SUBMITTED</span>;
      case 'UNDER_REVIEW':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> UNDER REVIEW</span>;
      case 'AWAITING_DOCUMENTS':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-300 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> AWAITING DOCS</span>;
      case 'APPROVED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> APPROVED</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-300 flex items-center gap-1"><XCircle className="w-2.5 h-2.5" /> REJECTED</span>;
      case 'CLOSED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white border border-slate-700">CLOSED</span>;
      default:
        return null;
    }
  };

  const formatCategory = (cat: ClaimCategory) => {
    switch (cat) {
      case 'DEATH_OF_MEMBER': return 'Death of Principal Member';
      case 'DEATH_OF_BENEFICIARY': return 'Death of Designated Beneficiary';
      case 'CRITICAL_ILLNESS_PENDING_POLICY': return 'Critical Illness (Pending Policy)';
      case 'PERMANENT_DISABILITY_PENDING_POLICY': return 'Disability (Pending Policy)';
      default: return 'Other Event';
    }
  };

  const formatDocCategory = (cat: DocumentCategory) => {
    switch (cat) {
      case 'DEATH_CERTIFICATE': return 'Death Certificate / Notification';
      case 'NATIONAL_ID_COPY': return 'National ID / Identity Proof';
      case 'BURIAL_PERMIT': return 'Burial Permit';
      case 'POLICE_REPORT': return 'Police Accident / Incident Report';
      case 'MEDICAL_REPORT': return 'Medical Officer Diagnosis / Report';
      case 'LC1_CHAIRPERSON_LETTER': return 'LC1 Chairperson Confirmation Letter';
      case 'SACCO_PASSBOOK_COPY': return 'SACCO Passbook / Statement Copy';
      default: return 'Supporting Document';
    }
  };

  if (!canView) {
    return (
      <div className="p-8 bg-white rounded-xl border border-slate-200 text-center shadow-xs">
        <Lock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <h2 className="text-base font-bold text-slate-800">Access Restricted: Claims Module</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          You do not possess the required institutional security permission (<code className="font-mono text-blue-700">claims.view</code>) to view or manage insurance claims. Contact your Branch Manager or IT Officer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-blue-700" />
            Turihamwe Insurance Claims Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Enforced Separation of Duties • Preparer Cannot Approve • Branch Audited Workflow
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchClaims}
            className="p-2 text-slate-600 hover:text-blue-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition shadow-xs text-xs font-semibold flex items-center gap-1.5"
            title="Refresh Claims"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {canCreate && (
            <button
              onClick={() => {
                resetNewForm();
                setIsNewModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              File New Claim Docket
            </button>
          )}
        </div>
      </div>

      {/* KPI Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
        <div
          onClick={() => setActiveTab('ALL')}
          className={`p-3.5 bg-white border rounded-xl shadow-xs cursor-pointer transition ${activeTab === 'ALL' ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <div className="text-slate-500 font-bold uppercase text-[10px]">Total Claims</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{stats.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">All Branch Records</div>
        </div>

        <div
          onClick={() => setActiveTab('ACTION_REQUIRED')}
          className={`p-3.5 bg-white border rounded-xl shadow-xs cursor-pointer transition ${activeTab === 'ACTION_REQUIRED' ? 'border-blue-600 ring-2 ring-blue-100' : 'border-blue-200 bg-blue-50/20 hover:border-blue-300'}`}
        >
          <div className="text-blue-700 font-bold uppercase text-[10px] flex items-center gap-1">
            <Clock className="w-3 h-3" /> Requiring Action
          </div>
          <div className="text-xl font-bold text-blue-900 mt-1">{stats.requiringAction}</div>
          <div className="text-[11px] text-blue-700 mt-0.5">Submitted / Reviewing</div>
        </div>

        <div
          onClick={() => setActiveTab('AWAITING_DOCUMENTS')}
          className={`p-3.5 bg-white border rounded-xl shadow-xs cursor-pointer transition ${activeTab === 'AWAITING_DOCUMENTS' ? 'border-purple-600 ring-2 ring-purple-100' : 'border-purple-200 bg-purple-50/20 hover:border-purple-300'}`}
        >
          <div className="text-purple-700 font-bold uppercase text-[10px] flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Awaiting Docs
          </div>
          <div className="text-xl font-bold text-purple-900 mt-1">{stats.awaitingDocuments}</div>
          <div className="text-[11px] text-purple-700 mt-0.5">Pending Member Docs</div>
        </div>

        <div
          onClick={() => setActiveTab('APPROVED')}
          className={`p-3.5 bg-white border rounded-xl shadow-xs cursor-pointer transition ${activeTab === 'APPROVED' ? 'border-emerald-600 ring-2 ring-emerald-100' : 'border-emerald-200 bg-emerald-50/20 hover:border-emerald-300'}`}
        >
          <div className="text-emerald-700 font-bold uppercase text-[10px] flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Approved
          </div>
          <div className="text-xl font-bold text-emerald-900 mt-1">{stats.approved}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">Awaiting Settlement</div>
        </div>

        <div
          onClick={() => setActiveTab('CLOSED')}
          className={`p-3.5 bg-white border rounded-xl shadow-xs cursor-pointer transition ${activeTab === 'CLOSED' ? 'border-slate-800 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <div className="text-slate-600 font-bold uppercase text-[10px]">Settled / Closed</div>
          <div className="text-xl font-bold text-slate-800 mt-1">{stats.closed}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Disbursement Recorded</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search: RESTRICTED to Claim ID, Account #, Member Name */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by Claim ID (CLM-...), SACCO Account #, or Member Name..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          {/* Workflow Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 text-xs">
            {(['ALL', 'ACTION_REQUIRED', 'UNDER_REVIEW', 'AWAITING_DOCUMENTS', 'APPROVED', 'REJECTED', 'CLOSED'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition text-[11px] ${activeTab === tab ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Date Filter & Operating Branch Info */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-slate-100 text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500">Date Range:</span>
            <input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px]"
            />
            <span>to</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px]"
            />
            {(filterStartDate || filterEndDate) && (
              <button
                onClick={() => {
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
                className="text-blue-700 hover:underline text-[11px] font-semibold ml-1"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <span>Operating Branch: <strong className="text-slate-700">{workingBranch?.name}</strong></span>
            {!isOnline && (
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px]">
                OFFLINE MODE (Local Cache)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Claims Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase text-[11px]">
              <tr>
                <th className="px-4 py-3">Claim Reference</th>
                <th className="px-4 py-3">Filing Date</th>
                <th className="px-4 py-3">SACCO Account</th>
                <th className="px-4 py-3">Member Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Subject / Beneficiary</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading claims records...
                  </td>
                </tr>
              ) : displayedClaims.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">No insurance claims found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      No claims match current status filter or search parameters.
                    </p>
                  </td>
                </tr>
              ) : (
                displayedClaims.map(claim => (
                  <tr key={claim.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono font-bold text-blue-900">
                      {claim.claimReference}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {claim.claimDate}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">
                      {claim.saccoAccountNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {claim.memberName}
                    </td>
                    <td className="px-4 py-3 text-[11px]">
                      {formatCategory(claim.claimCategory)}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-600">
                      {claim.beneficiaryName ? (
                        <span>{claim.beneficiaryName} ({claim.beneficiaryRelationship || 'Beneficiary'})</span>
                      ) : (
                        <span className="text-slate-400">Principal Member</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500">
                      {claim.branchName}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(claim.status)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedClaim(claim);
                          setDetailTab('overview');
                        }}
                        className="px-2.5 py-1 text-blue-700 hover:bg-blue-50 border border-blue-200 rounded font-semibold text-[11px] transition inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        Inspect Docket
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. INSPECT CLAIM DOCKET MODAL / DRAWER */}
      {/* ========================================================= */}
      {selectedClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-800">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 font-mono">
                      {selectedClaim.claimReference}
                    </h2>
                    {getStatusBadge(selectedClaim.status)}
                  </div>
                  <p className="text-xs text-slate-500">
                    Filing Date: {selectedClaim.claimDate} • Branch: {selectedClaim.branchName} • Preparer: {selectedClaim.preparerFullName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedClaim(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 text-xs font-semibold">
              <button
                onClick={() => setDetailTab('overview')}
                className={`py-3 px-4 border-b-2 transition ${detailTab === 'overview' ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                Claim Overview
              </button>
              <button
                onClick={() => setDetailTab('documents')}
                className={`py-3 px-4 border-b-2 transition flex items-center gap-1.5 ${detailTab === 'documents' ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                Supporting Documents ({selectedClaim.supportingDocuments.length})
              </button>
              <button
                onClick={() => setDetailTab('review_actions')}
                className={`py-3 px-4 border-b-2 transition ${detailTab === 'review_actions' ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                Review & Workflow Actions
              </button>
              {canViewHistory && (
                <button
                  onClick={() => setDetailTab('history')}
                  className={`py-3 px-4 border-b-2 transition ${detailTab === 'history' ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                  Audit Trail & History
                </button>
              )}
              <button
                onClick={() => setDetailTab('business_rules')}
                className={`py-3 px-4 border-b-2 transition flex items-center gap-1 text-slate-500 hover:text-slate-800 ${detailTab === 'business_rules' ? 'border-amber-600 text-amber-700' : 'border-transparent'}`}
              >
                <Shield className="w-3.5 h-3.5 text-amber-600" />
                Policy Rules
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs text-slate-700">
              {/* TAB 1: OVERVIEW */}
              {detailTab === 'overview' && (
                <div className="space-y-6">
                  {/* Warning banner if duplicate was overridden */}
                  {selectedClaim.duplicateWarningAcknowledged && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Duplicate Warning Override Recorded</span>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          {selectedClaim.duplicateOverrideReason || 'Filed with supervisor duplicate clearance.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Primary Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Member & Policy Card */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <UserIcon className="w-4 h-4 text-blue-700" />
                        Member & Turihamwe Policy
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Member Name:</span>
                          <span className="font-bold text-slate-900">{selectedClaim.memberName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">SACCO Account #:</span>
                          <span className="font-mono font-bold text-blue-900">{selectedClaim.saccoAccountNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Policy Plan Code:</span>
                          <span className="font-mono font-bold text-slate-800">{selectedClaim.planCode || selectedClaim.planId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Originating Branch:</span>
                          <span className="font-semibold text-slate-800">{selectedClaim.branchName}</span>
                        </div>
                      </div>
                    </div>

                    {/* Claim Details Card */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-purple-700" />
                        Claim Incident Particulars
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Claim Category:</span>
                          <span className="font-bold text-slate-900">{formatCategory(selectedClaim.claimCategory)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Incident Date:</span>
                          <span className="font-bold text-slate-800">{selectedClaim.incidentDate}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Subject Beneficiary:</span>
                          <span className="font-semibold text-slate-800">
                            {selectedClaim.beneficiaryName ? `${selectedClaim.beneficiaryName} (${selectedClaim.beneficiaryRelationship})` : 'Principal Member'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Preparer Staff:</span>
                          <span className="font-mono text-slate-700">{selectedClaim.preparerFullName} ({selectedClaim.preparerUsername})</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Incident Description */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5">
                    <div className="font-bold text-slate-800 uppercase text-[11px]">Incident Circumstances / Report</div>
                    <p className="text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                      {selectedClaim.incidentDescription || 'No detailed incident description provided.'}
                    </p>
                  </div>

                  {/* Latest Review Notes if any */}
                  {selectedClaim.latestReviewNotes && (
                    <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-1">
                      <div className="font-bold text-blue-900 uppercase text-[11px] flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 text-blue-700" />
                        Latest Reviewer Remarks
                      </div>
                      <p className="text-blue-950 font-medium">{selectedClaim.latestReviewNotes}</p>
                    </div>
                  )}

                  {/* Requested Documents Notes if in AWAITING_DOCUMENTS */}
                  {selectedClaim.requestedDocumentsNotes && (
                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 space-y-1">
                      <div className="font-bold text-purple-900 uppercase text-[11px] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-purple-700" />
                        Additional Documentation Requested
                      </div>
                      <p className="text-purple-950 font-medium">{selectedClaim.requestedDocumentsNotes}</p>
                    </div>
                  )}

                  {/* Approval / Rejection Box if decided */}
                  {selectedClaim.approvalRecord && (
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1.5">
                      <div className="font-bold text-emerald-900 uppercase text-[11px] flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-emerald-700" />
                        Executive Approval Record
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>Approved By: <strong>{selectedClaim.approvalRecord.decidedByFullName}</strong></div>
                        <div>Date: <strong>{new Date(selectedClaim.approvalRecord.decisionDate).toLocaleDateString()}</strong></div>
                        <div>Approval Ref: <strong className="font-mono text-emerald-800">{selectedClaim.approvalRecord.reasonOrReference}</strong></div>
                        <div>Branch: <strong>{selectedClaim.approvalRecord.branchName}</strong></div>
                      </div>
                      {selectedClaim.approvalRecord.decisionNotes && (
                        <p className="text-emerald-900 mt-1 italic">&ldquo;{selectedClaim.approvalRecord.decisionNotes}&rdquo;</p>
                      )}
                    </div>
                  )}

                  {selectedClaim.rejectionRecord && (
                    <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-1.5">
                      <div className="font-bold text-rose-900 uppercase text-[11px] flex items-center gap-1">
                        <XCircle className="w-4 h-4 text-rose-700" />
                        Formal Claim Rejection Record
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>Rejected By: <strong>{selectedClaim.rejectionRecord.decidedByFullName}</strong></div>
                        <div>Date: <strong>{new Date(selectedClaim.rejectionRecord.decisionDate).toLocaleDateString()}</strong></div>
                        <div className="col-span-2">
                          Reason: <strong className="text-rose-900">{selectedClaim.rejectionRecord.reasonOrReference}</strong>
                        </div>
                      </div>
                      {selectedClaim.rejectionRecord.decisionNotes && (
                        <p className="text-rose-900 mt-1 italic">&ldquo;{selectedClaim.rejectionRecord.decisionNotes}&rdquo;</p>
                      )}
                    </div>
                  )}

                  {/* Payment Reference Section (where applicable) */}
                  {canViewPayment && selectedClaim.paymentInfo && (
                    <div className="p-4 bg-slate-900 text-white rounded-xl shadow-xs space-y-2">
                      <div className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-emerald-400" />
                        Disbursement / Settlement Reference Recorded
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400">Payment Reference:</span>
                          <p className="font-mono font-bold text-white text-sm">{selectedClaim.paymentInfo.paymentReference}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Disbursement Date:</span>
                          <p className="font-bold text-white">{selectedClaim.paymentInfo.paymentDate}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Recorded By:</span>
                          <p className="font-mono text-slate-300">{selectedClaim.paymentInfo.recordedByUsername}</p>
                        </div>
                      </div>
                      {selectedClaim.paymentInfo.disbursementNotes && (
                        <p className="text-slate-300 text-[11px] border-t border-slate-800 pt-1.5 mt-1">
                          Notes: {selectedClaim.paymentInfo.disbursementNotes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SUPPORTING DOCUMENTS */}
              {detailTab === 'documents' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">Attached Documentation</h3>
                      <p className="text-xs text-slate-500">
                        Institutional files, certificates, and verifying affidavits attached to this docket.
                      </p>
                    </div>
                    {canUpload && selectedClaim.status !== 'CLOSED' && selectedClaim.status !== 'REJECTED' && (
                      <button
                        onClick={() => {
                          resetDocUploadForm();
                          setIsUploadDocModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Attach Document
                      </button>
                    )}
                  </div>

                  {selectedClaim.supportingDocuments.length === 0 ? (
                    <div className="p-8 border border-dashed border-slate-300 rounded-xl text-center bg-slate-50">
                      <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">No supporting documents attached yet</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Please upload death certificate, identity copy, or police reports to proceed with review.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-white">
                      {selectedClaim.supportingDocuments.map(doc => (
                        <div key={doc.id} className="p-4 hover:bg-slate-50 transition flex items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-700 shrink-0 mt-0.5">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-xs">{doc.documentTitle}</span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                  {formatDocCategory(doc.documentCategory)}
                                </span>
                                {doc.version > 1 && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800">
                                    v{doc.version}
                                  </span>
                                )}
                                {doc.status === 'REPLACED' && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                                    REPLACED
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                                {doc.originalFileName} • {(doc.fileSize / 1024).toFixed(1)} KB
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Uploaded by {doc.uploadedByUserFullName} ({doc.uploadedByUsername}) • {new Date(doc.uploadedAt).toLocaleString()}
                              </p>
                              {doc.notes && (
                                <p className="text-[11px] text-slate-600 mt-1 italic">&ldquo;{doc.notes}&rdquo;</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded font-semibold text-slate-700 text-xs transition"
                            >
                              View
                            </button>
                            {canUpload && selectedClaim.status !== 'CLOSED' && selectedClaim.status !== 'REJECTED' && (
                              <button
                                onClick={() => {
                                  resetDocUploadForm();
                                  setDocReplacedId(doc.id);
                                  setDocCategory(doc.documentCategory);
                                  setDocTitle(`${doc.documentTitle} (Revised)`);
                                  setIsUploadDocModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded font-semibold text-purple-700 text-xs transition"
                              >
                                Replace / Version
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: REVIEW & WORKFLOW ACTIONS */}
              {detailTab === 'review_actions' && (
                <div className="space-y-6">
                  {/* Status Pipeline Tracker */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="font-bold text-slate-800 uppercase text-[11px]">Workflow Stage</div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Current Status:</span>
                      {getStatusBadge(selectedClaim.status)}
                    </div>
                  </div>

                  {/* Review Action Controls */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                    <h3 className="font-bold text-slate-900 text-sm">Authorized Workflow Actions</h3>

                    <div className="flex flex-wrap gap-2.5">
                      {/* Review / Request Documents */}
                      {canReview && selectedClaim.status !== 'CLOSED' && selectedClaim.status !== 'REJECTED' && (
                        <button
                          onClick={() => {
                            setReviewNotes('');
                            setReviewActionType('UNDER_REVIEW');
                            setIsReviewModalOpen(true);
                          }}
                          className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold text-xs transition shadow-xs flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Record Review Notes / Request Docs
                        </button>
                      )}

                      {/* Approve Claim (Permission: claims.approve) */}
                      {canApprove && (selectedClaim.status === 'UNDER_REVIEW' || selectedClaim.status === 'SUBMITTED') && (
                        <button
                          onClick={() => {
                            setApprovalReference(`APP-${Date.now().toString().slice(-6)}`);
                            setApprovalNotes('');
                            setIsApproveModalOpen(true);
                          }}
                          className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition shadow-xs flex items-center gap-1.5"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Approve Claim
                        </button>
                      )}

                      {/* Reject Claim (Permission: claims.reject) */}
                      {canReject && (selectedClaim.status === 'UNDER_REVIEW' || selectedClaim.status === 'SUBMITTED' || selectedClaim.status === 'AWAITING_DOCUMENTS') && (
                        <button
                          onClick={() => {
                            setRejectionReason('');
                            setRejectionNotes('');
                            setIsRejectModalOpen(true);
                          }}
                          className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-semibold text-xs transition shadow-xs flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject Claim
                        </button>
                      )}

                      {/* Record Payment & Close (Permission: claims.close) */}
                      {canClose && selectedClaim.status === 'APPROVED' && !selectedClaim.paymentInfo && (
                        <button
                          onClick={() => {
                            setPaymentReference(`VCH-${Date.now().toString().slice(-6)}`);
                            setPaymentNotes('');
                            setIsPaymentModalOpen(true);
                          }}
                          className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-lg font-semibold text-xs transition shadow-xs flex items-center gap-1.5"
                        >
                          <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                          Record Payment Ref & Finalize Close
                        </button>
                      )}

                      {/* Close Docket Directly */}
                      {canClose && selectedClaim.status !== 'CLOSED' && selectedClaim.status !== 'DRAFT' && (
                        <button
                          onClick={async () => {
                            const reason = prompt('Please specify closure reason:');
                            if (!reason) return;
                            try {
                              if (isOnline) {
                                const res = await apiClient.closeClaim(selectedClaim.id, reason);
                                if (res.success && res.data) setSelectedClaim(res.data);
                              } else {
                                selectedClaim.status = 'CLOSED';
                                await localDb.claims.put(selectedClaim);
                              }
                              fetchClaims();
                              alert('Claim docket closed.');
                            } catch {
                              alert('Failed to close claim.');
                            }
                          }}
                          className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold text-xs transition shadow-xs"
                        >
                          Close Docket
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Review History Logs */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                      Review History & Supervisory Entries
                    </h3>
                    {selectedClaim.reviewHistory.length === 0 ? (
                      <p className="text-slate-400 text-xs italic">No formal review entries recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedClaim.reviewHistory.map((rev, idx) => (
                          <div key={rev.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-900">{rev.reviewerFullName}</span>
                              <span className="text-slate-400 font-mono">{new Date(rev.reviewDate).toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-slate-700">{rev.reviewNotes}</p>
                            {rev.requestedDocuments && rev.requestedDocuments.length > 0 && (
                              <div className="text-[11px] text-purple-700 bg-purple-50 p-2 rounded border border-purple-200 mt-1">
                                <strong>Requested Documents:</strong>
                                <ul className="list-disc list-inside mt-0.5">
                                  {rev.requestedDocuments.map((d, i) => <li key={i}>{d}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: AUDIT TRAIL & HISTORY */}
              {detailTab === 'history' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                      Immutable Claim Audit Log
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">Reference: {selectedClaim.claimReference}</span>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-start gap-2.5 text-xs">
                      <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                      <div>
                        <div className="font-bold text-slate-900">Claim Docket Created</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {selectedClaim.createdAt} • Created by {selectedClaim.preparerFullName} ({selectedClaim.preparerUsername}) at {selectedClaim.branchName}
                        </div>
                      </div>
                    </div>

                    {selectedClaim.supportingDocuments.map((doc, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-purple-600 mt-1.5 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900">Document Attached: {doc.documentTitle}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {doc.uploadedAt} • Uploaded by {doc.uploadedByUserFullName} • {doc.originalFileName}
                          </div>
                        </div>
                      </div>
                    ))}

                    {selectedClaim.approvalRecord && (
                      <div className="flex items-start gap-2.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900">Claim Approved (Ref: {selectedClaim.approvalRecord.reasonOrReference})</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {selectedClaim.approvalRecord.decisionDate} • Approved by {selectedClaim.approvalRecord.decidedByFullName}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedClaim.rejectionRecord && (
                      <div className="flex items-start gap-2.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-rose-600 mt-1.5 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900">Claim Rejected</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {selectedClaim.rejectionRecord.decisionDate} • Rejected by {selectedClaim.rejectionRecord.decidedByFullName} • Reason: {selectedClaim.rejectionRecord.reasonOrReference}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedClaim.paymentInfo && (
                      <div className="flex items-start gap-2.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-slate-800 mt-1.5 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900">Settlement Recorded: {selectedClaim.paymentInfo.paymentReference}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {selectedClaim.paymentInfo.recordedAt} • Recorded by {selectedClaim.paymentInfo.recordedByUsername}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: BUSINESS RULES CONFIGURATION */}
              {detailTab === 'business_rules' && (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                    <h4 className="font-bold text-amber-900 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                      <Shield className="w-4 h-4 text-amber-700" />
                      Institutional Policy Governance (Phase 5)
                    </h4>
                    <p className="text-xs text-amber-800">
                      In accordance with institutional guidelines, unconfirmed business rules (waiting periods, benefit calculations, and payment ceilings) remain explicitly configurable rather than hardcoded.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="font-bold text-slate-800">Benefit Amount Calculation</div>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[10px]">
                        PENDING INSTITUTIONAL APPROVAL
                      </span>
                      <p className="text-slate-500 mt-1 text-[11px]">
                        Benefit ceilings and calculation formulas remain under board review.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="font-bold text-slate-800">Policy Waiting Period</div>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[10px]">
                        PENDING INSTITUTIONAL APPROVAL
                      </span>
                      <p className="text-slate-500 mt-1 text-[11px]">
                        Enrolment-to-claim waiting period duration pending AGM ratification.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="font-bold text-slate-800">Claim Filing Deadline</div>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[10px]">
                        PENDING INSTITUTIONAL APPROVAL
                      </span>
                      <p className="text-slate-500 mt-1 text-[11px]">
                        Maximum notification period from date of incident pending sign-off.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="font-bold text-slate-800">Approval Hierarchy</div>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                        ENFORCED: BM OR GM APPROVAL
                      </span>
                      <p className="text-slate-500 mt-1 text-[11px]">
                        Separation of duties requires supervisory authorization.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">Docket ID: {selectedClaim.id}</span>
              <button
                onClick={() => setSelectedClaim(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. FILE NEW CLAIM DOCKET MODAL */}
      {/* ========================================================= */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-800">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">File New Turihamwe Claim</h2>
                  <p className="text-xs text-slate-500">
                    Operating Branch: {workingBranch?.name} • Preparer: {user?.fullName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewClaim} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* SACCO Member Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  SACCO Member (Search strictly by Account # or Member Name) *
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Enter SACCO account number (e.g. NYA-001042) or member name..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600"
                  />
                </div>

                {memberSearchResults.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto bg-white shadow-lg">
                    {memberSearchResults.map(m => (
                      <button
                        type="button"
                        key={m.saccoAccountNumber}
                        onClick={() => handleSelectMember(m)}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50 transition flex items-center justify-between text-xs"
                      >
                        <div>
                          <strong className="font-mono text-blue-900">{m.saccoAccountNumber}</strong> - {m.fullName}
                        </div>
                        <span className="text-[10px] text-slate-400">{m.branchName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Member & Plan Status */}
              {selectedMember && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-950">{selectedMember.fullName}</span>
                    <span className="font-mono font-bold text-blue-800">{selectedMember.saccoAccountNumber}</span>
                  </div>
                  {memberPlan ? (
                    <div className="text-[11px] text-blue-900 flex items-center gap-3">
                      <span>Turihamwe Plan: <strong className="font-mono">{memberPlan.id}</strong></span>
                      <span>Status: <strong className="text-emerald-700">{memberPlan.status}</strong></span>
                      <span>Expires: <strong>{memberPlan.currentExpiryDate}</strong></span>
                    </div>
                  ) : (
                    <div className="text-rose-700 font-bold text-[11px]">
                      Notice: No registered Turihamwe plan found for this member. A claim requires an active cover.
                    </div>
                  )}
                </div>
              )}

              {/* DUPLICATE CLAIM WARNING BANNER */}
              {duplicateWarning.detected && (
                <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-lg space-y-2 text-rose-900">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    POTENTIAL DUPLICATE CLAIM DETECTED
                  </div>
                  <p className="text-[11px]">
                    An active or ongoing claim docket already exists for this member / plan:
                  </p>
                  <div className="space-y-1">
                    {duplicateWarning.duplicateClaims.map(dup => (
                      <div key={dup.id} className="p-2 bg-white rounded border border-rose-200 font-mono text-[11px]">
                        <strong>{dup.claimReference}</strong> ({dup.status}) - Filed {dup.claimDate} for {dup.memberName}
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-rose-200">
                    <label className="block font-bold text-rose-950 mb-1">
                      Override Justification Reason (Mandatory to Proceed) *
                    </label>
                    <textarea
                      value={duplicateOverrideJustification}
                      onChange={e => setDuplicateOverrideJustification(e.target.value)}
                      rows={2}
                      placeholder="Explain legitimate reason for filing subsequent or separate claim docket..."
                      className="w-full p-2 bg-white border border-rose-300 rounded text-xs text-rose-950 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                </div>
              )}

              {/* Claim Category */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Claim Category *</label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value as ClaimCategory)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="DEATH_OF_MEMBER">Death of Principal Member</option>
                  <option value="DEATH_OF_BENEFICIARY">Death of Designated Beneficiary</option>
                  <option value="CRITICAL_ILLNESS_PENDING_POLICY">Critical Illness (Pending Institutional Policy)</option>
                  <option value="PERMANENT_DISABILITY_PENDING_POLICY">Permanent Disability (Pending Institutional Policy)</option>
                  <option value="OTHER_EVENT">Other Qualifying Event</option>
                </select>
              </div>

              {/* Designated Beneficiary (if applicable) */}
              {planBeneficiaries.length > 0 && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Subject Beneficiary (Select if claim relates to registered beneficiary)
                  </label>
                  <select
                    value={formBeneficiaryId}
                    onChange={e => {
                      setFormBeneficiaryId(e.target.value);
                      if (selectedMember && memberPlan) {
                        checkDuplicates(selectedMember.saccoAccountNumber, memberPlan.id, e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="">-- None (Claim relates to principal member directly) --</option>
                    {planBeneficiaries.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.fullName} ({b.relationship}) - {b.percentageAllocation}% Allocation
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Incident Date */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Date of Incident / Occurrence *</label>
                <input
                  type="date"
                  value={formIncidentDate}
                  onChange={e => setFormIncidentDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              {/* Incident Description */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Incident Description & Circumstances *
                </label>
                <textarea
                  value={formIncidentDescription}
                  onChange={e => setFormIncidentDescription(e.target.value)}
                  rows={3}
                  placeholder="Detail the circumstances, location, hospital, or event leading to this claim..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              {/* Initial Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Initial Docket Status</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="initialStatus"
                      value="SUBMITTED"
                      checked={formInitialStatus === 'SUBMITTED'}
                      onChange={() => setFormInitialStatus('SUBMITTED')}
                    />
                    <span>Submit for Review</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="initialStatus"
                      value="DRAFT"
                      checked={formInitialStatus === 'DRAFT'}
                      onChange={() => setFormInitialStatus('DRAFT')}
                    />
                    <span>Save as Draft</span>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewClaim || !selectedMember || !memberPlan}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-xs"
                >
                  {isSubmittingNewClaim ? 'Filing Claim Docket...' : 'Create Claim Docket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. RECORD REVIEW / REQUEST DOCUMENTS MODAL */}
      {/* ========================================================= */}
      {isReviewModalOpen && selectedClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Record Claim Review</h3>
              <button onClick={() => setIsReviewModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Review Action</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="reviewAction"
                      value="UNDER_REVIEW"
                      checked={reviewActionType === 'UNDER_REVIEW'}
                      onChange={() => setReviewActionType('UNDER_REVIEW')}
                    />
                    <span>Verification Under Review</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="reviewAction"
                      value="AWAITING_DOCUMENTS"
                      checked={reviewActionType === 'AWAITING_DOCUMENTS'}
                      onChange={() => setReviewActionType('AWAITING_DOCUMENTS')}
                    />
                    <span>Request Additional Documents</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reviewer Findings & Notes *</label>
                <textarea
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  rows={3}
                  placeholder="Record verification notes, checks against SACCO records, or questions..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {reviewActionType === 'AWAITING_DOCUMENTS' && (
                <div>
                  <label className="block font-bold text-purple-900 mb-1">
                    Requested Documents (1 per line) *
                  </label>
                  <textarea
                    value={requestedDocsText}
                    onChange={e => setRequestedDocsText(e.target.value)}
                    rows={2}
                    placeholder="e.g. Certified Death Certificate&#10;LC1 Confirmation Letter"
                    className="w-full p-2.5 bg-purple-50 border border-purple-300 rounded-lg text-xs"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  onClick={() => setIsReviewModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReviewSubmit}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg shadow-xs"
                >
                  Submit Review Entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. APPROVE CLAIM MODAL */}
      {/* ========================================================= */}
      {isApproveModalOpen && selectedClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-emerald-50 flex items-center justify-between">
              <h3 className="font-bold text-emerald-900 text-sm flex items-center gap-1.5">
                <CheckCircle className="w-5 h-5 text-emerald-700" />
                Authorize Claim Approval
              </h3>
              <button onClick={() => setIsApproveModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200 text-emerald-950">
                <p>
                  Approving docket <strong className="font-mono">{selectedClaim.claimReference}</strong> for <strong>{selectedClaim.memberName}</strong>.
                </p>
                <p className="text-[11px] text-emerald-800 mt-1">
                  Approving User: {user?.fullName} ({user?.roleName}) • Branch: {workingBranch?.name}
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Approval Reference / Resolution Number</label>
                <input
                  type="text"
                  value={approvalReference}
                  onChange={e => setApprovalReference(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Executive Approval Notes</label>
                <textarea
                  value={approvalNotes}
                  onChange={e => setApprovalNotes(e.target.value)}
                  rows={3}
                  placeholder="Record formal supervisory or committee approval remarks..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  onClick={() => setIsApproveModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveSubmit}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs"
                >
                  Confirm Approval
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. REJECT CLAIM MODAL */}
      {/* ========================================================= */}
      {isRejectModalOpen && selectedClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-rose-50 flex items-center justify-between">
              <h3 className="font-bold text-rose-900 text-sm flex items-center gap-1.5">
                <XCircle className="w-5 h-5 text-rose-700" />
                Formal Claim Rejection
              </h3>
              <button onClick={() => setIsRejectModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-rose-900 mb-1">Formal Rejection Reason *</label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="e.g. Ineligible beneficiary / fraudulent documentation / expired coverage"
                  className="w-full px-3 py-2 bg-rose-50 border border-rose-300 rounded-lg text-rose-950"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Rejection Remarks / Justification</label>
                <textarea
                  value={rejectionNotes}
                  onChange={e => setRejectionNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional audit notes explaining the basis for rejection..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  onClick={() => setIsRejectModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectSubmit}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-semibold rounded-lg shadow-xs"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. RECORD PAYMENT REFERENCE MODAL */}
      {/* ========================================================= */}
      {isPaymentModalOpen && selectedClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                Record Payment / Voucher Reference
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
                <strong>Notice:</strong> This logs the official voucher / cheque / mobile money disbursement reference. It does not initiate a bank funds transfer.
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Reference / Voucher # *</label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={e => setPaymentReference(e.target.value)}
                  placeholder="e.g. VCH-2026-0042 or CHQ-081290"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Disbursement Date *</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Disbursement Notes</label>
                <textarea
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  rows={2}
                  placeholder="Record payee name, mobile number or bank draft notes..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePaymentSubmit}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs"
                >
                  Save Reference & Close Claim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. UPLOAD SUPPORTING DOCUMENT MODAL */}
      {/* ========================================================= */}
      {isUploadDocModalOpen && selectedClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-blue-700" />
                Attach Supporting Document
              </h3>
              <button onClick={() => setIsUploadDocModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleDocumentSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Document Category *</label>
                <select
                  value={docCategory}
                  onChange={e => setDocCategory(e.target.value as DocumentCategory)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="DEATH_CERTIFICATE">Death Certificate / Notification</option>
                  <option value="NATIONAL_ID_COPY">National ID / Identity Proof</option>
                  <option value="BURIAL_PERMIT">Burial Permit</option>
                  <option value="POLICE_REPORT">Police Accident / Incident Report</option>
                  <option value="MEDICAL_REPORT">Medical Officer Report</option>
                  <option value="LC1_CHAIRPERSON_LETTER">LC1 Chairperson Confirmation Letter</option>
                  <option value="SACCO_PASSBOOK_COPY">SACCO Passbook / Statement Copy</option>
                  <option value="OTHER_SUPPORTING_DOC">Other Supporting Document</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Document Title *</label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  placeholder="e.g. Mbarara Hospital Death Certificate"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Choose File (Max 10MB) *</label>
                <input
                  type="file"
                  onChange={handleDocFileChange}
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-600 file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  required
                />
                {docUploadError && (
                  <p className="text-rose-600 text-[11px] mt-1 font-semibold">{docUploadError}</p>
                )}
              </div>

              {docReplacedId && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-1.5">
                  <span className="font-bold text-purple-900">Document Versioning: Replacing Existing Document</span>
                  <div>
                    <label className="block font-semibold text-purple-900 text-[11px]">Reason for Replacement *</label>
                    <input
                      type="text"
                      value={docReplacementReason}
                      onChange={e => setDocReplacementReason(e.target.value)}
                      placeholder="e.g. Certified copy provided / legible scan uploaded"
                      className="w-full px-2.5 py-1.5 bg-white border border-purple-300 rounded text-xs text-purple-950"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Remarks</label>
                <input
                  type="text"
                  value={docNotes}
                  onChange={e => setDocNotes(e.target.value)}
                  placeholder="Additional context about this file..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadDocModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!docFile || Boolean(docUploadError)}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-xs"
                >
                  Upload & Attach
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 8. DOCUMENT PREVIEW MODAL */}
      {/* ========================================================= */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{previewDoc.documentTitle}</h3>
                <p className="text-xs text-slate-500 font-mono">
                  {previewDoc.originalFileName} • {(previewDoc.fileSize / 1024).toFixed(1)} KB
                </p>
              </div>
              <button onClick={() => setPreviewDoc(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 text-xs text-slate-700 space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>Category: <strong>{formatDocCategory(previewDoc.documentCategory)}</strong></div>
                  <div>Status: <strong>{previewDoc.status}</strong></div>
                  <div>Uploaded By: <strong>{previewDoc.uploadedByUserFullName}</strong></div>
                  <div>Upload Date: <strong>{new Date(previewDoc.uploadedAt).toLocaleString()}</strong></div>
                  <div>Version: <strong>v{previewDoc.version}</strong></div>
                  <div>Branch: <strong>{previewDoc.branchName}</strong></div>
                </div>
              </div>

              {previewDoc.fileDataUrl && previewDoc.mimeType.startsWith('image/') ? (
                <div className="text-center p-2 bg-slate-100 rounded-lg">
                  <img
                    src={previewDoc.fileDataUrl}
                    alt={previewDoc.documentTitle}
                    className="max-h-96 mx-auto rounded shadow-xs"
                  />
                </div>
              ) : (
                <div className="p-10 border border-dashed border-slate-300 rounded-xl text-center bg-slate-50 space-y-2">
                  <FileText className="w-12 h-12 text-blue-600 mx-auto" />
                  <p className="font-bold text-slate-800 text-sm">{previewDoc.originalFileName}</p>
                  <p className="text-xs text-slate-500">
                    File format: <code className="font-mono text-blue-700">{previewDoc.mimeType}</code>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Document securely archived in Nyamuyanja SACCO local and central storage vault.
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
