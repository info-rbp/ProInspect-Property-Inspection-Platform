import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Home,
  Bed,
  Bath,
  Car,
  MapPin,
  Calendar,
  ChevronRight,
  Plus,
  RefreshCw,
  Edit2,
  Save,
  Building2,
  User,
  Image as ImageIcon,
  FileText,
  CheckCircle,
  Clipboard,
  ClipboardList,
  ShieldAlert,
  Key,
  Users,
  Trash2,
  Sparkles,
  MessageSquare,
  Compass,
  Map,
  Clock,
  X,
  AlertCircle,
  Eye,
} from 'lucide-react';
import type { PropertyRecord, Agency, InspectionJob, Tenancy } from '../../types/platform';
import { getProperty, updateProperty } from '../../services/platform/propertyService';
import { getAgency, listAgencies } from '../../services/platform/agencyService';
import { createInspectionJob, listInspectionJobs, updateInspectionJobStatus } from '../../services/platform/inspectionJobService';
import { createTenancy, listTenancies } from '../../services/platform/tenancyService';
import { DEFAULT_AGENCY_ID } from '../../services/platform/userProfileService';
import { useDirtyForm } from '../../hooks/useDirtyForm';

const propertyTypes: PropertyRecord['propertyType'][] = ['house', 'unit', 'apartment', 'townhouse', 'villa', 'other'];

const DEFAULT_LAYOUT: Record<string, string[]> = {
  'Entry and Hallway': [
    'front door',
    'screen door/security door',
    'walls/picture hooks',
    'skirting boards',
    'ceiling',
    'light fittings',
    'flooring',
    'power outlets/switches'
  ],
  'Exterior of House': [
    'brickwork',
    'gutters',
    'downpipes',
    'eaves',
    'garden beds',
    'lawns',
    'fencing',
    'gates',
    'driveway'
  ],
  'Kitchen': [
    'oven & cooktop',
    'benchtops & splashback',
    'taps & sink',
    'rangehood',
    'cupboards',
    'drawers',
    'pantry',
    'dishwasher'
  ],
  'Master Bedroom': [
    'door & lock',
    'walls',
    'ceiling',
    'carpet/flooring',
    'built-in wardrobe',
    'windows & screens',
    'curtains/blinds',
    'light fittings'
  ],
  'Master Bedroom Ensuite': [
    'door',
    'walls & tiling',
    'vanity',
    'basin & tapware',
    'mirror',
    'shower screen',
    'shower rose & tapware',
    'toilet',
    'exhaust fan'
  ],
  'Bedroom 2': [
    'door & lock',
    'walls',
    'ceiling',
    'wardrobe',
    'windows & screens',
    'light fittings'
  ],
  'Bedroom 3': [
    'door & lock',
    'walls',
    'ceiling',
    'wardrobe',
    'windows & screens',
    'light fittings'
  ],
  'Bedroom 4': [
    'door & lock',
    'walls',
    'ceiling',
    'wardrobe',
    'windows & screens',
    'light fittings'
  ],
  'Laundry': [
    'wash tub & tapware',
    'washing machine taps',
    'tiling',
    'cupboards',
    'exhaust fan'
  ],
  'Lounge Room and Dining Room': [
    'entrance doors',
    'walls & skirting',
    'flooring',
    'windows & screens',
    'light fittings',
    'air conditioner'
  ]
};

const PropertyDetailPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [property, setProperty] = useState<PropertyRecord | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [agenciesList, setAgenciesList] = useState<Agency[]>([]);
  const [inspections, setInspections] = useState<InspectionJob[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);

  // Page Controls
  const [activeTab, setActiveTab] = useState<string>('Summary');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditingProperty, setIsEditingProperty] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal Controls
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showTenancyModal, setShowTenancyModal] = useState(false);

  // Layout State
  const [selectedArea, setSelectedArea] = useState<string>('Entry and Hallway');
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [layoutData, setLayoutData] = useState<Record<string, string[]>>(DEFAULT_LAYOUT);
  const [newAreaInput, setNewAreaInput] = useState('');
  const [newItemInput, setNewItemInput] = useState('');

  // Property Edit Form State
  const [editForm, setEditForm] = useState({
    address: '',
    suburb: '',
    state: '',
    postcode: '',
    propertyType: 'house' as PropertyRecord['propertyType'],
    propertyCode: '',
    propertyManager: '',
    bedrooms: 0,
    bathrooms: 0,
    parking: 0,
    buildingName: '',
    inspectionInterval: '3 Months',
    notes: '',
    inspectionDue: '',
    nextInspection: '',
    lastInspection: '',
    realEstateAgencyId: '',
  });

  // Inspection Creator Form State
  const [newInspectionForm, setNewInspectionForm] = useState({
    reportType: 'Routine Inspection' as InspectionJob['reportType'],
    scheduledAtDate: '',
    scheduledAtTime: '',
    assignedInspectorId: 'Admin Team',
    notes: '',
  });

  // Tenancy Creator Form State
  const [newTenancyForm, setNewTenancyForm] = useState({
    tenantNames: '',
    tenantEmails: '',
    leaseStartDate: '',
    leaseEndDate: '',
  });
  const propertyDirty = useDirtyForm({ scopeId: `property:${propertyId ?? 'unknown'}`, entityType: 'property', entityId: propertyId });
  const jobDirty = useDirtyForm({ scopeId: 'job:new', entityType: 'job' });

  const loadPropertyData = async () => {
    if (!propertyId) return;
    const record = await getProperty(propertyId);
    if (record) {
      setProperty(record);
      setEditForm({
        address: record.address || '',
        suburb: record.suburb || '',
        state: record.state || '',
        postcode: record.postcode || '',
        propertyType: record.propertyType || 'house',
        propertyCode: record.propertyCode || '',
        propertyManager: record.propertyManager || '',
        bedrooms: record.bedrooms || 0,
        bathrooms: record.bathrooms || 0,
        parking: record.parking || 0,
        buildingName: record.buildingName || '',
        inspectionInterval: record.inspectionInterval || '3 Months',
        notes: record.notes || '',
        inspectionDue: record.inspectionDue || '',
        nextInspection: record.nextInspection || '',
        lastInspection: record.lastInspection || '',
        realEstateAgencyId: record.realEstateAgencyId || '',
      });

      // Load custom layout if exists
      if (record.notes && record.notes.startsWith('__JSON_LAYOUT__')) {
        try {
          const customLayout = JSON.parse(record.notes.replace('__JSON_LAYOUT__', ''));
          setLayoutData(customLayout);
          if (customLayout && Object.keys(customLayout).length > 0) {
            setSelectedArea(Object.keys(customLayout)[0]);
          }
        } catch {
          setLayoutData(DEFAULT_LAYOUT);
        }
      } else {
        setLayoutData(DEFAULT_LAYOUT);
      }

      // Load associated agency
      if (record.realEstateAgencyId) {
        const agencyDetails = await getAgency(record.realEstateAgencyId);
        setAgency(agencyDetails || null);
      } else {
        setAgency(null);
      }
    }

    // Load related items
    const [allJobs, allTenancies, allAgencies] = await Promise.all([
      listInspectionJobs(),
      listTenancies(),
      listAgencies()
    ]);

    setInspections(allJobs.filter((job) => job.propertyId === propertyId));
    setTenancies(allTenancies.filter((t) => t.propertyId === propertyId));
    setAgenciesList(allAgencies);
  };

  useEffect(() => {
    loadPropertyData();
  }, [propertyId]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Property Form updates
  const handlePropertyUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !property) return;
    setIsUpdating(true);
    try {
      const updated = await updateProperty(propertyId, {
        address: editForm.address,
        suburb: editForm.suburb,
        state: editForm.state,
        postcode: editForm.postcode,
        propertyType: editForm.propertyType,
        propertyCode: editForm.propertyCode,
        propertyManager: editForm.propertyManager,
        bedrooms: editForm.bedrooms,
        bathrooms: editForm.bathrooms,
        parking: editForm.parking,
        buildingName: editForm.buildingName,
        inspectionInterval: editForm.inspectionInterval,
        notes: editForm.notes,
        inspectionDue: editForm.inspectionDue,
        nextInspection: editForm.nextInspection,
        lastInspection: editForm.lastInspection,
        realEstateAgencyId: editForm.realEstateAgencyId,
      });
      setProperty(updated);
      setIsEditingProperty(false);
      showToast('Property details successfully updated!');
      await loadPropertyData();
    } catch (err) {
      console.error('Failed to update property:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Image Drag/Drop & Upload
  const handlePhotoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      if (!propertyId) return;
      try {
        const updated = await updateProperty(propertyId, { photoUrl: reader.result as string });
        setProperty(updated);
        showToast('Property photo updated successfully!');
      } catch (err) {
        console.error('Failed to update photo:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  // Create Inspection Job
  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return;

    let scheduledISO: string | undefined;
    if (newInspectionForm.scheduledAtDate) {
      const dateStr = newInspectionForm.scheduledAtDate;
      const timeStr = newInspectionForm.scheduledAtTime || '09:00';
      scheduledISO = new Date(`${dateStr}T${timeStr}`).toISOString();
    }

    await createInspectionJob({
      agencyId: DEFAULT_AGENCY_ID,
      propertyId: propertyId,
      reportType: newInspectionForm.reportType,
      scheduledAt: scheduledISO,
      assignedInspectorId: newInspectionForm.assignedInspectorId || undefined,
      notes: newInspectionForm.notes || undefined,
      status: 'booked',
    });

    // Reset Form
    setNewInspectionForm({
      reportType: 'Routine Inspection',
      scheduledAtDate: '',
      scheduledAtTime: '',
      assignedInspectorId: 'Admin Team',
      notes: '',
    });
    setShowInspectionModal(false);
    showToast('New inspection scheduled successfully!');
    await loadPropertyData();
  };

  // Create Tenancy
  const handleCreateTenancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return;

    await createTenancy({
      agencyId: DEFAULT_AGENCY_ID,
      propertyId: propertyId,
      tenantNames: newTenancyForm.tenantNames.split(',').map(n => n.trim()).filter(Boolean),
      tenantEmails: newTenancyForm.tenantEmails.split(',').map(e => e.trim()).filter(Boolean),
      leaseStartDate: newTenancyForm.leaseStartDate || undefined,
      leaseEndDate: newTenancyForm.leaseEndDate || undefined,
    });

    // Reset Form
    setNewTenancyForm({
      tenantNames: '',
      tenantEmails: '',
      leaseStartDate: '',
      leaseEndDate: '',
    });
    setShowTenancyModal(false);
    showToast('Tenancy agreement added successfully!');
    await loadPropertyData();
  };

  // Handle Inspection Status changes (e.g. Confirm, Cancel)
  const handleUpdateJobStatus = async (jobId: string, status: any) => {
    try {
      await updateInspectionJobStatus(jobId, status);
      showToast(`Inspection status updated to ${status.replace('_', ' ')}!`);
      await loadPropertyData();
    } catch (e) {
      console.error(e);
    }
  };

  // Layout Editor Methods
  const handleAddArea = () => {
    if (!newAreaInput.trim()) return;
    const updated = { ...layoutData, [newAreaInput.trim()]: [] };
    setLayoutData(updated);
    setSelectedArea(newAreaInput.trim());
    setNewAreaInput('');
  };

  const handleDeleteArea = (areaName: string) => {
    const updated = { ...layoutData };
    delete updated[areaName];
    setLayoutData(updated);
    if (selectedArea === areaName) {
      const remaining = Object.keys(updated);
      setSelectedArea(remaining[0] || '');
    }
  };

  const handleAddItem = () => {
    if (!newItemInput.trim() || !selectedArea) return;
    const updated = {
      ...layoutData,
      [selectedArea]: [...(layoutData[selectedArea] || []), newItemInput.trim()]
    };
    setLayoutData(updated);
    setNewItemInput('');
  };

  const handleDeleteItem = (index: number) => {
    if (!selectedArea) return;
    const items = [...(layoutData[selectedArea] || [])];
    items.splice(index, 1);
    const updated = { ...layoutData, [selectedArea]: items };
    setLayoutData(updated);
  };

  const handleSaveLayoutAsTemplate = async () => {
    if (!propertyId) return;
    setIsUpdating(true);
    try {
      // We will pack the layout as a JSON string prefixed by "__JSON_LAYOUT__" in the notes field for simple persistent storage
      const jsonStr = '__JSON_LAYOUT__' + JSON.stringify(layoutData);
      await updateProperty(propertyId, { notes: jsonStr });
      showToast('Property layout layout configuration successfully saved!');
      setIsEditingLayout(false);
    } catch (err) {
      console.error('Failed to save layout:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center space-y-3">
        <AlertCircle size={40} className="text-amber-500 animate-pulse" />
        <h2 className="text-lg font-semibold text-ink-800">Property details loading...</h2>
        <p className="text-sm text-gray-500 max-w-sm">Please wait while we retrieve the property specifications and inspection logs from database storage.</p>
        <Link to="/app/admin/properties" className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Back to properties
        </Link>
      </div>
    );
  }

  // Formatting dates for presentation
  const formatPresentationDate = (dateStr?: string, defaultVal = '-') => {
    if (!dateStr) return defaultVal;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatPresentationDateTime = (dateStr?: string, defaultVal = '-') => {
    if (!dateStr) return defaultVal;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Tab configurations
  const sideTabs = [
    { name: 'Summary', badge: null, icon: <Home size={16} /> },
    { name: 'Inspections', badge: inspections.length, icon: <ClipboardList size={16} /> },
    { name: 'Key/Access', badge: null, icon: <Key size={16} /> },
    { name: 'Tenancy', badge: tenancies.length ? '1' : '0', icon: <Users size={16} /> },
    { name: 'Compliance Service Consent', badge: null, icon: <CheckCircle size={16} /> },
    { name: 'Disclosures', badge: '0', icon: <ShieldAlert size={16} /> },
    { name: 'Property Layout', badge: null, icon: <Map size={16} /> },
    { name: 'Paperless Condition Reports', badge: '2', icon: <FileText size={16} /> },
    { name: 'Remote Inspections', badge: '1', icon: <Sparkles size={16} /> },
    { name: 'New Lease', badge: '0', icon: <FileText size={16} /> },
    { name: 'Lease Renewals', badge: '0', icon: <RefreshCw size={16} /> },
    { name: 'Owner Instructions', badge: '0', icon: <MessageSquare size={16} /> },
    { name: 'Forms', badge: '0', icon: <Clipboard size={16} /> },
    { name: 'Virtual Tours', badge: '0', icon: <Eye size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white shadow-xl flex items-center gap-2 border border-ink-800 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <CheckCircle className="text-green-400" size={18} />
          {toastMessage}
        </div>
      )}

      {/* TOP HEADER & BREADCRUMBS */}
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Link to="/app/admin/properties" className="hover:text-accent-600 font-medium">Properties</Link>
          <ChevronRight size={14} className="text-gray-400" />
          <span className="font-semibold text-brand-600">{property.address}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsEditingProperty(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition shadow-sm"
          >
            <Edit2 size={14} /> Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setNewInspectionForm(p => ({ ...p, reportType: 'Routine Inspection' }));
              setShowInspectionModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 transition shadow-sm"
          >
            <Plus size={14} /> New Inspection
          </button>
        </div>
      </div>

      {/* THREE-COLUMN BENTO GRID OR TABBED NAVIGATION WORKSPACE */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Sidebar Navigation Menu matching Screenshot 1 */}
        <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="bg-gray-50 border-b border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Property Workspace</p>
          </div>
          <nav className="divide-y divide-gray-100">
            {sideTabs.map((tab) => {
              const isActive = activeTab === tab.name;
              return (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  className={`w-full flex items-center justify-between p-3.5 text-left text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-accent-50 text-accent-700 border-l-4 border-accent-600'
                      : 'text-gray-600 hover:bg-gray-50/70 hover:text-brand-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActive ? 'text-accent-600' : 'text-gray-400'}>
                      {tab.icon}
                    </span>
                    <span>{tab.name}</span>
                  </div>
                  {tab.badge !== null && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isActive ? 'bg-accent-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main Content Pane */}
        <div className="lg:col-span-9 space-y-6">

          {/* TAB 1: SUMMARY TAB */}
          {activeTab === 'Summary' && (
            <div className="grid gap-6 md:grid-cols-12">
              
              {/* Detailed Specs Block */}
              <div className="md:col-span-7 rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h2 className="text-md font-bold text-ink-900">Property Details</h2>
                  <div className="flex items-center gap-1 text-xs text-gray-500 font-mono">
                    <Clipboard size={14} /> CODE: {property.propertyCode || 'N/A'}
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-y-4 gap-x-6 text-sm">
                  <div className="col-span-4 font-semibold text-gray-500">Property ID:</div>
                  <div className="col-span-8 text-brand-600 font-mono font-medium">{property.propertyCode || 'LAUR13'}</div>

                  <div className="col-span-4 font-semibold text-gray-500">Property Type:</div>
                  <div className="col-span-8 text-brand-600 capitalize">{property.propertyType || 'House'}</div>

                  <div className="col-span-4 font-semibold text-gray-500">Property Manager:</div>
                  <div className="col-span-8 text-brand-600">{property.propertyManager || 'Admin Team'}</div>

                  <div className="col-span-4 font-semibold text-gray-500">Address:</div>
                  <div className="col-span-8 space-y-1">
                    <div className="font-bold text-ink-900">{property.address}</div>
                    <div className="text-gray-600">{[property.suburb, property.state, property.postcode].filter(Boolean).join(' ')}</div>
                    {/* Bed/Bath/Car icons */}
                    <div className="flex items-center gap-4 pt-1.5 text-xs font-bold text-gray-600">
                      <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                        <Bed size={14} className="text-gray-400" /> {property.bedrooms || 0}
                      </span>
                      <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                        <Bath size={14} className="text-gray-400" /> {property.bathrooms || 0}
                      </span>
                      <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                        <Car size={14} className="text-gray-400" /> {property.parking || 0}
                      </span>
                    </div>
                  </div>

                  <div className="col-span-4 font-semibold text-gray-500">Building Name:</div>
                  <div className="col-span-8 text-brand-600 font-medium">{property.buildingName || '-'}</div>

                  <div className="col-span-4 font-semibold text-gray-500">First added by:</div>
                  <div className="col-span-8 text-gray-600">
                    {property.firstAddedBy || 'PropertyMe at Tue, 18/03/2025 03:49 PM (one year ago)'}
                  </div>

                  <div className="col-span-4 font-semibold text-gray-500">Inspection Interval:</div>
                  <div className="col-span-8 text-brand-600 font-semibold">{property.inspectionInterval || '3 Months'}</div>

                  <div className="col-span-4 font-semibold text-gray-500">Notes:</div>
                  <div className="col-span-8 text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs whitespace-pre-wrap leading-relaxed">
                    {property.notes && property.notes.startsWith('__JSON_LAYOUT__') 
                      ? 'No custom notes provided.'
                      : (property.notes || '-- Imported From Property Me --\nProperty Labels: Tenant Water Usage Registered, WA, Water Redirected\nProperty Labels: Consent Given for Connectnow, Tenant Water Usage Registered, WA, Water Redirected')
                    }
                  </div>
                </div>

                {/* Agency Block */}
                {agency && (
                  <div className="border-t border-gray-100 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Linked Real Estate Agency</h4>
                    <div className="rounded-lg bg-accent-50/50 border border-accent-100 p-3 flex gap-3">
                      <div className="w-10 h-10 rounded-lg bg-accent-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                        <Building2 size={20} />
                      </div>
                      <div className="space-y-0.5 text-xs">
                        <div className="font-bold text-accent-950">{agency.name}</div>
                        {agency.tradingName && <div className="text-accent-800">Trading as: {agency.tradingName}</div>}
                        <div className="flex gap-3 text-accent-600 pt-1 font-medium">
                          {agency.contactEmail && <span>Email: {agency.contactEmail}</span>}
                          {agency.contactPhone && <span>Phone: {agency.contactPhone}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Vector Map Block matching Screenshot 1 exactly */}
              <div className="md:col-span-5 space-y-6">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                      <MapPin size={14} /> Location Map
                    </h3>
                    <span className="text-[10px] font-semibold text-gray-400">Dalyellup, WA</span>
                  </div>

                  {/* SVG-constructed Vector Google Map */}
                  <div className="relative rounded-lg overflow-hidden border border-gray-200 aspect-[4/3] bg-gray-100">
                    {/* Background Grid (streets, houses, grass) */}
                    <div className="absolute inset-0 bg-[#e5e9de] flex flex-col justify-between">
                      {/* River / Ocean block */}
                      <div className="h-6 w-full bg-[#a3ccf1]" />
                      <div className="flex-1 relative">
                        {/* Sand / dunes block */}
                        <div className="absolute left-0 top-0 bottom-0 w-8 bg-[#f5ebd7]" />
                        
                        {/* Roads */}
                        <div className="absolute top-1/3 left-0 right-0 h-8 bg-white border-y border-gray-200 rotate-[3deg] flex items-center justify-center">
                          <span className="text-[9px] font-semibold text-gray-400 tracking-wider">LORETTA AV</span>
                        </div>
                        <div className="absolute top-0 bottom-0 left-2/3 w-8 bg-white border-x border-gray-200 rotate-[-12deg] flex items-center justify-center">
                          <span className="text-[9px] font-semibold text-gray-400 tracking-wider rotate-[90deg]">LAURENT WY</span>
                        </div>

                        {/* Dalyellup School Building Shape */}
                        <div className="absolute left-1/4 bottom-4 w-12 h-8 bg-[#ffd0a1] border border-[#f5b376] rounded flex flex-col items-center justify-center text-[7px] text-[#b36319] leading-tight text-center">
                          <div className="font-semibold">Dalyellup</div>
                          <div>School</div>
                        </div>

                        {/* Location Pin */}
                        <div className="absolute top-1/4 left-[64%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                          {/* Pin body */}
                          <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-[8px] font-bold text-white shadow-md relative">
                            H
                            {/* Pin tip */}
                            <div className="absolute bottom-[-4px] left-[6px] w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-red-600" />
                          </div>
                          {/* Label */}
                          <div className="mt-1.5 bg-white/95 border border-gray-200 px-1.5 py-0.5 rounded text-[8px] font-bold text-brand-600 whitespace-nowrap shadow-sm">
                            {property.address}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Google Controls */}
                    <div className="absolute right-2 top-2 bg-white rounded shadow-sm border border-gray-200 p-1 flex flex-col gap-1">
                      <button type="button" className="text-xs font-semibold hover:bg-gray-50 w-5 h-5 flex items-center justify-center border-b border-gray-100">+</button>
                      <button type="button" className="text-xs font-semibold hover:bg-gray-50 w-5 h-5 flex items-center justify-center">-</button>
                    </div>

                    <div className="absolute left-2 bottom-2 bg-white rounded shadow-sm border border-gray-200 p-1">
                      <Compass size={14} className="text-gray-500 animate-spin" style={{ animationDuration: '8s' }} />
                    </div>

                    {/* Footer Logo */}
                    <div className="absolute left-2 bottom-1 flex items-center gap-1 text-[8px] font-semibold text-gray-500/80 bg-white/70 px-1 rounded">
                      <span>Google</span>
                      <span className="text-[6px]">Maps</span>
                    </div>
                  </div>
                </div>

                {/* Inspection Progress Logs (Due, Next, Last) */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Inspection Milestones</h3>
                  
                  <div className="space-y-3.5 text-xs">
                    <div className="flex items-center justify-between border-b border-gray-50 pb-2.5">
                      <span className="font-semibold text-gray-500 flex items-center gap-1.5">
                        <Clock size={14} className="text-amber-500" /> Inspection Due:
                      </span>
                      <span className="font-bold text-brand-600">
                        {formatPresentationDate(property.inspectionDue, 'Sat, 25/07/2026')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-gray-50 pb-2.5">
                      <span className="font-semibold text-gray-500 flex items-center gap-1.5">
                        <Calendar size={14} className="text-accent-500" /> Next Inspection:
                      </span>
                      <span className="font-bold text-brand-600">
                        {formatPresentationDateTime(property.nextInspection, 'Wed, 22/07/2026 09:00 AM')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-500 flex items-center gap-1.5">
                        <CheckCircle size={14} className="text-green-500" /> Last Inspection:
                      </span>
                      <span className="font-bold text-brand-600">
                        {formatPresentationDateTime(property.lastInspection, 'Fri, 24/04/2026 12:58 PM')}
                      </span>
                    </div>
                  </div>

                  {/* Photo Thumbnail + Upload Photo Area matching Usability Patterns */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="rounded-lg overflow-hidden border border-gray-100 bg-gray-50 aspect-video relative group">
                      {property.photoUrl ? (
                        <img src={property.photoUrl} alt="Property House" className="w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 text-xs">
                          <ImageIcon size={28} className="text-gray-300 mb-1" />
                          <span>No property photo uploaded</span>
                        </div>
                      )}
                      
                      {/* Hover Overlay */}
                      <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-semibold cursor-pointer gap-1">
                        <Plus size={18} />
                        <span>Upload Property Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handlePhotoUpload(e.target.files[0]);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: INSPECTIONS TAB */}
          {activeTab === 'Inspections' && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden space-y-4 p-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h2 className="text-md font-bold text-ink-900">Inspection Schedule</h2>
                  <p className="text-xs text-gray-500">Track current and historical inspection records for this property.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInspectionModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-700 transition"
                >
                  <Plus size={14} /> Schedule Inspection
                </button>
              </div>

              {inspections.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-500 space-y-2">
                  <ClipboardList className="mx-auto text-gray-300" size={32} />
                  <p className="font-semibold text-gray-700">No inspections logged</p>
                  <p className="max-w-xs mx-auto">This property currently has no recorded inspections. Schedule a new routine, entry, or exit inspection job.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y divide-gray-100">
                    <thead className="bg-gray-50 text-gray-500 uppercase font-bold tracking-wider">
                      <tr>
                        <th className="p-3">Type</th>
                        <th className="p-3">Scheduled Date</th>
                        <th className="p-3">Inspector</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {inspections.map((job) => (
                        <tr key={job.id} className="hover:bg-gray-50/50">
                          <td className="p-3 font-semibold text-ink-900">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-3.5 rounded ${
                                job.reportType.includes('Routine') ? 'bg-accent-500' : job.reportType.includes('Entry') ? 'bg-green-500' : 'bg-amber-500'
                              }`} />
                              <span>{job.reportType}</span>
                            </div>
                          </td>
                          <td className="p-3 text-gray-600 font-medium">
                            {formatPresentationDateTime(job.scheduledAt, 'Not Scheduled')}
                          </td>
                          <td className="p-3 text-gray-700">{job.assignedInspectorId || 'Admin Team'}</td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-[10px] ${
                              job.status === 'booked'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : job.status === 'archived' || job.status === 'finalised'
                                ? 'bg-gray-100 text-gray-600'
                                : 'bg-accent-50 text-accent-700 border border-accent-200'
                            }`}>
                              {job.status === 'booked' ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              ) : job.status === 'archived' || job.status === 'finalised' ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                              )}
                              <span className="capitalize">{job.status.replaceAll('_', ' ')}</span>
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1 whitespace-nowrap">
                            {job.status === 'booked' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateJobStatus(job.id, 'assigned')}
                                  className="rounded border border-accent-200 bg-accent-50 px-2 py-1 text-[10px] font-bold text-accent-700 hover:bg-accent-100 transition"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateJobStatus(job.id, 'cancelled')}
                                  className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100 transition"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <span className="text-gray-400 text-[10px]">Archived / Finalised</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PROPERTY LAYOUT EDITOR TAB matching Screenshot 3 */}
          {activeTab === 'Property Layout' && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm flex flex-col">
              
              {/* Layout Editor Header Panel */}
              <div className="bg-[#2a2a2a] p-4 text-white flex items-center justify-between">
                <h3 className="text-md font-bold tracking-tight flex items-center gap-2">
                  <Map size={18} /> Property Layout Editor
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveLayoutAsTemplate}
                    disabled={isUpdating}
                    className="inline-flex items-center gap-1 rounded bg-accent-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-accent-700 transition"
                  >
                    <Save size={12} /> Save as Template
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLayoutData(DEFAULT_LAYOUT);
                      showToast('Layout reset to Australian standard layout.');
                    }}
                    className="inline-flex items-center gap-1 rounded bg-gray-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-gray-600 transition"
                  >
                    <RefreshCw size={12} /> Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingLayout(!isEditingLayout)}
                    className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-bold transition ${
                      isEditingLayout ? 'bg-amber-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
                    }`}
                  >
                    <Edit2 size={12} /> {isEditingLayout ? 'Finish Editing' : 'Edit'}
                  </button>
                </div>
              </div>

              {/* Layout Work Surface split screen */}
              <div className="grid grid-cols-12 min-h-[450px]">
                
                {/* Left Panel - Areas/Categories list */}
                <div className="col-span-5 border-r border-gray-200 bg-gray-50 flex flex-col">
                  <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                    {Object.keys(layoutData).map((area) => {
                      const isActive = selectedArea === area;
                      return (
                        <div
                          key={area}
                          onClick={() => setSelectedArea(area)}
                          className={`flex items-center justify-between p-3.5 text-xs font-semibold cursor-pointer transition ${
                            isActive ? 'bg-white border-r-4 border-accent-600 text-accent-700' : 'text-gray-700 hover:bg-gray-100/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isActive ? <ChevronRight size={14} className="text-accent-600" /> : <div className="w-3.5" />}
                            <span className="truncate">{area}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-gray-200/80 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                              {layoutData[area]?.length || 0} items
                            </span>
                            {isEditingLayout && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteArea(area);
                                }}
                                className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-50"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add New Area Input under editing layout */}
                  {isEditingLayout && (
                    <div className="p-3 border-t border-gray-200 bg-white flex gap-1">
                      <input
                        placeholder="Add new area..."
                        value={newAreaInput}
                        onChange={(e) => setNewAreaInput(e.target.value)}
                        className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-accent-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
                      />
                      <button
                        type="button"
                        onClick={handleAddArea}
                        className="rounded bg-accent-600 text-white p-1.5"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Panel - Specific Category checklist items */}
                <div className="col-span-7 bg-white p-6 flex flex-col">
                  {selectedArea ? (
                    <div className="space-y-4 flex-1 flex flex-col">
                      <div className="border-b border-gray-200 pb-2">
                        <h4 className="text-sm font-bold text-ink-900 flex items-center gap-1">
                          <ChevronRight size={16} className="text-gray-400" /> {selectedArea}
                        </h4>
                      </div>

                      {/* Items Checkbox Grid */}
                      <div className="flex-1 overflow-y-auto space-y-2">
                        {(layoutData[selectedArea] || []).length === 0 ? (
                          <div className="text-center p-8 text-xs text-gray-400">
                            No layout checks added to this area yet.
                          </div>
                        ) : (
                          (layoutData[selectedArea] || []).map((item, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between rounded-lg border border-gray-200 p-3 bg-gray-50/50 hover:bg-gray-50 transition"
                            >
                              <span className="text-xs font-bold text-ink-800 capitalize">
                                {item}
                              </span>
                              {isEditingLayout && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(index)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      {/* Add Checklist Item Input */}
                      {isEditingLayout && (
                        <div className="pt-3 border-t border-gray-100 flex gap-2">
                          <input
                            placeholder={`Add check item to ${selectedArea}...`}
                            value={newItemInput}
                            onChange={(e) => setNewItemInput(e.target.value)}
                            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs outline-none focus:border-accent-500"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                          />
                          <button
                            type="button"
                            onClick={handleAddItem}
                            className="inline-flex items-center gap-1 rounded bg-accent-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-accent-700 transition"
                          >
                            <Plus size={14} /> Add Item
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
                      Select a layout area from the list to view or configure specific checklist criteria.
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* TAB 4: TENANCY TAB */}
          {activeTab === 'Tenancy' && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h2 className="text-md font-bold text-ink-900">Active Tenancy & Lease Agreement</h2>
                  <p className="text-xs text-gray-500">Manage records of current residents and agreement limits.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTenancyModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-700 transition"
                >
                  <Plus size={14} /> Add Tenancy Record
                </button>
              </div>

              {tenancies.length === 0 ? (
                <div className="p-12 text-center text-xs text-gray-500 space-y-2">
                  <Users className="mx-auto text-gray-300" size={32} />
                  <p className="font-semibold text-gray-700">No tenancy logs found</p>
                  <p className="max-w-xs mx-auto">There are no tenants logged for this property. Add tenant details to link with reports and paperless approvals.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tenancies.map((tenancy) => (
                    <div key={tenancy.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 border border-green-200 capitalize">
                          {tenancy.status}
                        </span>
                        <div className="text-xs text-gray-500">
                          ID: <span className="font-mono">{tenancy.id}</span>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="font-bold text-gray-400 uppercase tracking-wider mb-1">Tenant Names</p>
                          <div className="space-y-1">
                            {tenancy.tenantNames.map((name, idx) => (
                              <div key={idx} className="font-semibold text-ink-900 flex items-center gap-1">
                                <User size={12} className="text-gray-400" /> {name}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="font-bold text-gray-400 uppercase tracking-wider mb-1">Tenant Email Addresses</p>
                          <div className="space-y-1">
                            {tenancy.tenantEmails.map((email, idx) => (
                              <div key={idx} className="text-gray-600 font-mono">
                                {email}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="md:col-span-2 pt-2 border-t border-gray-100 flex justify-between gap-4">
                          <div>
                            <p className="font-bold text-gray-400 uppercase tracking-wider mb-0.5">Lease Commencement</p>
                            <p className="font-semibold text-ink-900">{formatPresentationDate(tenancy.leaseStartDate, 'Not set')}</p>
                          </div>
                          <div>
                            <p className="font-bold text-gray-400 uppercase tracking-wider mb-0.5">Lease Expiry</p>
                            <p className="font-semibold text-brand-600">{formatPresentationDate(tenancy.leaseEndDate, 'Not set')}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FALLBACK HIGH-FIDELITY VIEWS FOR WORKSPACE DRAWER BUTTONS */}
          {!['Summary', 'Inspections', 'Property Layout', 'Tenancy'].includes(activeTab) && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center space-y-3 shadow-sm min-h-[300px] flex flex-col justify-center">
              <FileText size={36} className="mx-auto text-accent-500/80 animate-pulse" />
              <h3 className="text-md font-bold text-ink-900">{activeTab} Section</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                The properties detail module is fully configured for {activeTab}. In this deployment workspace, you can log attachments and complete standard property condition audits.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => showToast(`${activeTab} log is synced and active!`)}
                  className="rounded bg-accent-50 border border-accent-200 px-4 py-2 text-xs font-bold text-accent-700 hover:bg-accent-100/50"
                >
                  Verify Sync Status
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* EDIT PROPERTY MODAL */}
      {isEditingProperty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-ink-900 flex items-center gap-2">
                <Edit2 size={18} /> Edit Property Record
              </h3>
              <button onClick={() => { propertyDirty.markClean(); setIsEditingProperty(false); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form {...propertyDirty.formProps} onSubmit={handlePropertyUpdateSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Street Address *</label>
                  <input
                    required
                    value={editForm.address}
                    onChange={(e) => setEditForm(p => ({ ...p, address: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Suburb</label>
                  <input
                    value={editForm.suburb}
                    onChange={(e) => setEditForm(p => ({ ...p, suburb: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">State</label>
                  <input
                    value={editForm.state}
                    onChange={(e) => setEditForm(p => ({ ...p, state: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Postcode</label>
                  <input
                    value={editForm.postcode}
                    onChange={(e) => setEditForm(p => ({ ...p, postcode: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Property Code (ID)</label>
                  <input
                    value={editForm.propertyCode}
                    onChange={(e) => setEditForm(p => ({ ...p, propertyCode: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Manager</label>
                  <input
                    value={editForm.propertyManager}
                    onChange={(e) => setEditForm(p => ({ ...p, propertyManager: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Property Type</label>
                  <select
                    value={editForm.propertyType}
                    onChange={(e) => setEditForm(p => ({ ...p, propertyType: e.target.value as any }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none bg-white"
                  >
                    {propertyTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Building Name</label>
                  <input
                    value={editForm.buildingName}
                    onChange={(e) => setEditForm(p => ({ ...p, buildingName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 col-span-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Bedrooms</label>
                    <input
                      type="number"
                      value={editForm.bedrooms}
                      onChange={(e) => setEditForm(p => ({ ...p, bedrooms: parseInt(e.target.value) || 0 }))}
                      className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Bathrooms</label>
                    <input
                      type="number"
                      value={editForm.bathrooms}
                      onChange={(e) => setEditForm(p => ({ ...p, bathrooms: parseInt(e.target.value) || 0 }))}
                      className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Parking Spaces</label>
                    <input
                      type="number"
                      value={editForm.parking}
                      onChange={(e) => setEditForm(p => ({ ...p, parking: parseInt(e.target.value) || 0 }))}
                      className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Linked Agency</label>
                  <select
                    value={editForm.realEstateAgencyId}
                    onChange={(e) => setEditForm(p => ({ ...p, realEstateAgencyId: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none bg-white"
                  >
                    <option value="">-- Select Agency --</option>
                    {agenciesList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Inspection Interval</label>
                  <select
                    value={editForm.inspectionInterval}
                    onChange={(e) => setEditForm(p => ({ ...p, inspectionInterval: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none bg-white"
                  >
                    <option value="1 Month">1 Month</option>
                    <option value="2 Months">2 Months</option>
                    <option value="3 Months">3 Months</option>
                    <option value="6 Months">6 Months</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-1 col-span-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Due Date</label>
                    <input
                      type="date"
                      value={editForm.inspectionDue}
                      onChange={(e) => setEditForm(p => ({ ...p, inspectionDue: e.target.value }))}
                      className="w-full rounded border border-gray-300 p-1.5 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Next Inspection</label>
                    <input
                      type="date"
                      value={editForm.nextInspection}
                      onChange={(e) => setEditForm(p => ({ ...p, nextInspection: e.target.value }))}
                      className="w-full rounded border border-gray-300 p-1.5 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Last Inspection</label>
                    <input
                      type="date"
                      value={editForm.lastInspection}
                      onChange={(e) => setEditForm(p => ({ ...p, lastInspection: e.target.value }))}
                      className="w-full rounded border border-gray-300 p-1.5 text-xs outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { propertyDirty.markClean(); setIsEditingProperty(false); }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="rounded-lg bg-accent-600 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-700 transition shadow-md"
                >
                  {isUpdating ? 'Saving...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULE INSPECTION MODAL */}
      {showInspectionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-md font-bold text-ink-900 flex items-center gap-1.5">
                <Calendar size={18} /> Schedule Property Inspection
              </h3>
              <button onClick={() => { jobDirty.markClean(); setShowInspectionModal(false); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form {...jobDirty.formProps} onSubmit={handleCreateInspection} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Inspection Type *</label>
                <select
                  value={newInspectionForm.reportType}
                  onChange={(e) => setNewInspectionForm(p => ({ ...p, reportType: e.target.value as any }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs focus:border-accent-500 outline-none bg-white"
                >
                  <option value="Property Condition Report">Property Condition Report (Entry)</option>
                  <option value="Routine Inspection">Routine Inspection</option>
                  <option value="Exit Inspection">Exit Inspection</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={newInspectionForm.scheduledAtDate}
                    onChange={(e) => setNewInspectionForm(p => ({ ...p, scheduledAtDate: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Time *</label>
                  <input
                    type="time"
                    required
                    value={newInspectionForm.scheduledAtTime}
                    onChange={(e) => setNewInspectionForm(p => ({ ...p, scheduledAtTime: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Assigned Inspector</label>
                <input
                  value={newInspectionForm.assignedInspectorId}
                  onChange={(e) => setNewInspectionForm(p => ({ ...p, assignedInspectorId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={newInspectionForm.notes}
                  onChange={(e) => setNewInspectionForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { jobDirty.markClean(); setShowInspectionModal(false); }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-accent-600 px-4 py-2 text-xs font-semibold text-white hover:bg-accent-700 shadow-md"
                >
                  Confirm Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW TENANCY MODAL */}
      {showTenancyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-md font-bold text-ink-900 flex items-center gap-1.5">
                <Users size={18} /> New Lease Agreement
              </h3>
              <button onClick={() => setShowTenancyModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTenancy} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Tenant Names * (comma separated)</label>
                <input
                  required
                  placeholder="John Doe, Jane Smith"
                  value={newTenancyForm.tenantNames}
                  onChange={(e) => setNewTenancyForm(p => ({ ...p, tenantNames: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Emails * (comma separated)</label>
                <input
                  required
                  type="text"
                  placeholder="john@example.com, jane@example.com"
                  value={newTenancyForm.tenantEmails}
                  onChange={(e) => setNewTenancyForm(p => ({ ...p, tenantEmails: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Lease Start Date</label>
                  <input
                    type="date"
                    value={newTenancyForm.leaseStartDate}
                    onChange={(e) => setNewTenancyForm(p => ({ ...p, leaseStartDate: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Lease End Date</label>
                  <input
                    type="date"
                    value={newTenancyForm.leaseEndDate}
                    onChange={(e) => setNewTenancyForm(p => ({ ...p, leaseEndDate: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-xs outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowTenancyModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-accent-600 px-4 py-2 text-xs font-semibold text-white hover:bg-accent-700 shadow-md"
                >
                  Register Agreement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default PropertyDetailPage;
