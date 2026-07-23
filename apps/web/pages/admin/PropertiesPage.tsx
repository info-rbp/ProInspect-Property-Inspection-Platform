import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Home, Eye, Building2, Image as ImageIcon, Sparkles } from 'lucide-react';
import type { PropertyRecord, Agency } from '../../types/platform';
import { createProperty, listProperties } from '../../services/platform/propertyService';
import { listAgencies, createAgency } from '../../services/platform/agencyService';
import { DEFAULT_AGENCY_ID } from '../../services/platform/userProfileService';
import { useDirtyForm } from '../../hooks/useDirtyForm';

const propertyTypes: PropertyRecord['propertyType'][] = ['house', 'unit', 'apartment', 'townhouse', 'villa', 'other'];

const PropertiesPage: React.FC = () => {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingAgency, setIsCreatingAgency] = useState(false);

  // Agency Form State
  const [agencyForm, setAgencyForm] = useState({
    name: '',
    tradingName: '',
    abn: '',
    contactEmail: '',
    contactPhone: '',
  });

  // Property Form State
  const [form, setForm] = useState({
    address: '',
    suburb: '',
    state: 'WA',
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
    photoUrl: '',
    realEstateAgencyId: '',
  });

  const [dragActive, setDragActive] = useState(false);
  const propertyDirty = useDirtyForm({ scopeId: 'property:new', entityType: 'property' });
  const agencyDirty = useDirtyForm({ scopeId: 'settings:agency:new', entityType: 'settings' });

  const loadData = async () => {
    const [propList, agencyList] = await Promise.all([
      listProperties(),
      listAgencies()
    ]);
    setProperties(propList);
    setAgencies(agencyList);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePropertySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.address) return;

    await createProperty({
      agencyId: DEFAULT_AGENCY_ID,
      address: form.address,
      suburb: form.suburb,
      state: form.state,
      postcode: form.postcode,
      propertyType: form.propertyType,
      propertyCode: form.propertyCode || undefined,
      propertyManager: form.propertyManager || undefined,
      bedrooms: form.bedrooms || undefined,
      bathrooms: form.bathrooms || undefined,
      parking: form.parking || undefined,
      buildingName: form.buildingName || undefined,
      firstAddedBy: `ProInspect Admin at ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
      inspectionInterval: form.inspectionInterval || undefined,
      notes: form.notes || undefined,
      inspectionDue: form.inspectionDue || undefined,
      nextInspection: form.nextInspection || undefined,
      lastInspection: form.lastInspection || undefined,
      photoUrl: form.photoUrl || undefined,
      realEstateAgencyId: form.realEstateAgencyId || undefined,
    });

    // Reset Form
    setForm({
      address: '',
      suburb: '',
      state: 'WA',
      postcode: '',
      propertyType: 'house',
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
      photoUrl: '',
      realEstateAgencyId: '',
    });
    setIsCreating(false);
    await loadData();
  };

  const handleAgencySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!agencyForm.name) return;

    const newAgency = await createAgency({
      name: agencyForm.name,
      tradingName: agencyForm.tradingName || undefined,
      abn: agencyForm.abn || undefined,
      contactEmail: agencyForm.contactEmail || undefined,
      contactPhone: agencyForm.contactPhone || undefined,
    });

    setAgencyForm({
      name: '',
      tradingName: '',
      abn: '',
      contactEmail: '',
      contactPhone: '',
    });
    setIsCreatingAgency(false);
    
    // Refresh agency list and set the newly created agency as selected
    const updatedAgencies = await listAgencies();
    setAgencies(updatedAgencies);
    setForm(prev => ({ ...prev, realEstateAgencyId: newAgency.id }));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((prev) => ({ ...prev, photoUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const getAgencyName = (agencyId?: string) => {
    if (!agencyId) return 'None';
    const agency = agencies.find(a => a.id === agencyId);
    return agency ? agency.name : 'Unknown Agency';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-600">Properties</h1>
          <p className="text-sm text-gray-600">Comprehensive property records including layout, inspections, and agency association.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setIsCreatingAgency(true);
              setIsCreating(false);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition shadow-sm"
          >
            <Building2 size={16} /> Add Agency
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(true);
              setIsCreatingAgency(false);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-md"
          >
            <Plus size={16} /> Add Property
          </button>
        </div>
      </div>

      {/* CREATE AGENCY PANEL */}
      {isCreatingAgency && (
        <div className="rounded-xl border border-accent-100 bg-accent-50/50 p-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between border-b border-accent-100 pb-3 mb-4">
            <h2 className="text-lg font-semibold text-accent-900 flex items-center gap-2">
              <Building2 className="text-accent-600" size={20} />
              Register New Real Estate Agency
            </h2>
            <button
              type="button"
              onClick={() => { agencyDirty.markClean(); setIsCreatingAgency(false); }}
              className="text-accent-500 hover:text-accent-700 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
          <form {...agencyDirty.formProps} onSubmit={handleAgencySubmit} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-accent-800 uppercase mb-1">Agency Name *</label>
              <input
                required
                placeholder="e.g. Century 21 Dalyellup"
                value={agencyForm.name}
                onChange={(e) => setAgencyForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-lg border border-accent-200 bg-white p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-accent-800 uppercase mb-1">Trading Name</label>
              <input
                placeholder="e.g. C21 Real Estate"
                value={agencyForm.tradingName}
                onChange={(e) => setAgencyForm((prev) => ({ ...prev, tradingName: e.target.value }))}
                className="w-full rounded-lg border border-accent-200 bg-white p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-accent-800 uppercase mb-1">ABN</label>
              <input
                placeholder="e.g. 12 345 678 910"
                value={agencyForm.abn}
                onChange={(e) => setAgencyForm((prev) => ({ ...prev, abn: e.target.value }))}
                className="w-full rounded-lg border border-accent-200 bg-white p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-accent-800 uppercase mb-1">Contact Email</label>
              <input
                type="email"
                placeholder="e.g. contact@c21dalyellup.com.au"
                value={agencyForm.contactEmail}
                onChange={(e) => setAgencyForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                className="w-full rounded-lg border border-accent-200 bg-white p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-accent-800 uppercase mb-1">Contact Phone</label>
              <input
                placeholder="e.g. (08) 9721 3456"
                value={agencyForm.contactPhone}
                onChange={(e) => setAgencyForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                className="max-w-md w-full rounded-lg border border-accent-200 bg-white p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
              />
            </div>
            <div className="md:col-span-2 flex gap-2 pt-2 border-t border-accent-100 mt-2">
              <button
                type="submit"
                className="rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-700 shadow-sm transition"
              >
                Register Agency
              </button>
              <button
                type="button"
                onClick={() => { agencyDirty.markClean(); setIsCreatingAgency(false); }}
                className="rounded-lg border border-accent-200 bg-white px-5 py-2.5 text-sm font-semibold text-accent-700 hover:bg-accent-100/50 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CREATE PROPERTY PANEL */}
      {isCreating && (
        <form {...propertyDirty.formProps} onSubmit={handlePropertySubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-md animate-in fade-in slide-in-from-top-4 duration-200 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-lg font-semibold text-brand-600 flex items-center gap-2">
              <Home size={20} className="text-gray-700" />
              Add Detailed Property Record
            </h2>
            <button
              type="button"
              onClick={() => { propertyDirty.markClean(); setIsCreating(false); }}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {/* 1. Basic Details */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">1. Address & Core Info</h3>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Street Address *</label>
                <input
                  required
                  placeholder="e.g. 13 Laurent Wy"
                  value={form.address}
                  onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Suburb</label>
                  <input
                    placeholder="e.g. Dalyellup"
                    value={form.suburb}
                    onChange={(e) => setForm((prev) => ({ ...prev, suburb: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                  <input
                    placeholder="e.g. WA"
                    value={form.state}
                    onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Postcode</label>
                  <input
                    placeholder="e.g. 6230"
                    value={form.postcode}
                    onChange={(e) => setForm((prev) => ({ ...prev, postcode: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Property Type</label>
                  <select
                    value={form.propertyType}
                    onChange={(e) => setForm((prev) => ({ ...prev, propertyType: e.target.value as PropertyRecord['propertyType'] }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition capitalize bg-white"
                  >
                    {propertyTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Building Name (Optional)</label>
                <input
                  placeholder="e.g. Oceanview Heights"
                  value={form.buildingName}
                  onChange={(e) => setForm((prev) => ({ ...prev, buildingName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                />
              </div>
            </div>

            {/* 2. Specs & Managers */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">2. Attributes & Agency</h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Beds</label>
                  <input
                    type="number"
                    min="0"
                    value={form.bedrooms}
                    onChange={(e) => setForm((prev) => ({ ...prev, bedrooms: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Baths</label>
                  <input
                    type="number"
                    min="0"
                    value={form.bathrooms}
                    onChange={(e) => setForm((prev) => ({ ...prev, bathrooms: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cars</label>
                  <input
                    type="number"
                    min="0"
                    value={form.parking}
                    onChange={(e) => setForm((prev) => ({ ...prev, parking: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Property Code (ID)</label>
                  <input
                    placeholder="e.g. LAUR13"
                    value={form.propertyCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, propertyCode: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Manager/Team</label>
                  <input
                    placeholder="e.g. Admin Team"
                    value={form.propertyManager}
                    onChange={(e) => setForm((prev) => ({ ...prev, propertyManager: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-medium text-gray-600">Real Estate Agency</label>
                  <button
                    type="button"
                    onClick={() => setIsCreatingAgency(true)}
                    className="text-xs text-accent-600 hover:text-accent-800 hover:underline font-semibold"
                  >
                    + Register Agency
                  </button>
                </div>
                <select
                  value={form.realEstateAgencyId}
                  onChange={(e) => setForm((prev) => ({ ...prev, realEstateAgencyId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition bg-white"
                >
                  <option value="">-- No agency linked --</option>
                  {agencies.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Inspection Interval</label>
                <select
                  value={form.inspectionInterval}
                  onChange={(e) => setForm((prev) => ({ ...prev, inspectionInterval: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition bg-white"
                >
                  <option value="1 Month">1 Month</option>
                  <option value="2 Months">2 Months</option>
                  <option value="3 Months">3 Months</option>
                  <option value="6 Months">6 Months</option>
                  <option value="12 Months">12 Months</option>
                </select>
              </div>
            </div>

            {/* 3. Schedule, Notes & Photo */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">3. Inspections & Photo</h3>
              <div className="grid grid-cols-3 gap-1">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Due Date</label>
                  <input
                    type="date"
                    value={form.inspectionDue}
                    onChange={(e) => setForm((prev) => ({ ...prev, inspectionDue: e.target.value }))}
                    className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-accent-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Next Inspection</label>
                  <input
                    type="date"
                    value={form.nextInspection}
                    onChange={(e) => setForm((prev) => ({ ...prev, nextInspection: e.target.value }))}
                    className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-accent-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Last Inspection</label>
                  <input
                    type="date"
                    value={form.lastInspection}
                    onChange={(e) => setForm((prev) => ({ ...prev, lastInspection: e.target.value }))}
                    className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-accent-500 outline-none transition"
                  />
                </div>
              </div>

              {/* Photo Upload Area matching Usability Patterns */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Property Image (Drag & Drop or Click)</label>
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
                    dragActive ? 'border-accent-500 bg-accent-50' : 'border-gray-300 hover:border-accent-500'
                  }`}
                  onClick={() => document.getElementById('photo-upload-input')?.click()}
                >
                  <input
                    id="photo-upload-input"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {form.photoUrl ? (
                    <div className="relative group mx-auto w-32 h-20 rounded overflow-hidden border border-gray-200">
                      <img src={form.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-white font-semibold">Change photo</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-500 space-y-1">
                      <ImageIcon size={24} className="mx-auto text-gray-400" />
                      <p className="text-xs font-medium text-accent-600">Upload property photo</p>
                      <p className="text-[10px] text-gray-400">Supports drag and drop or manual click</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Property Notes</label>
                <textarea
                  rows={2}
                  placeholder="Enter property notes, water usage consents, special requirements..."
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-accent-500 focus:ring-1 focus:ring-accent-500 outline-none transition"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-gray-100">
            <button
              id="create-property-detailed-submit-btn"
              type="submit"
              className="rounded-lg bg-accent-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-700 shadow-md transition-all flex items-center gap-2"
            >
              <Sparkles size={16} /> Create Property
            </button>
            <button
              type="button"
              onClick={() => { propertyDirty.markClean(); setIsCreating(false); }}
              className="rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* PROPERTIES LISTING */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {properties.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 space-y-2">
            <Home className="mx-auto text-gray-300" size={36} />
            <p className="font-semibold text-gray-700">No properties in system yet</p>
            <p className="text-xs max-w-sm mx-auto">Create your first property with layout details, inspector allocation, and agency branding to begin inspection reporting.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm divide-y divide-gray-100">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wider">
                <tr>
                  <th className="p-4">Property Address</th>
                  <th className="p-4">Property Code</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Real Estate Agency</th>
                  <th className="p-4">Specs</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {properties.map((property) => (
                  <tr key={property.id} className="hover:bg-gray-50/50 transition">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {property.photoUrl ? (
                          <img src={property.photoUrl} alt="Property" className="w-12 h-10 rounded object-cover border border-gray-100" />
                        ) : (
                          <div className="w-12 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-100">
                            <Home size={18} />
                          </div>
                        )}
                        <div>
                          <Link
                            to={`/app/admin/properties/${property.id}`}
                            className="font-semibold text-brand-600 hover:text-accent-600 hover:underline transition"
                          >
                            {property.address}
                          </Link>
                          <div className="text-xs text-gray-500">
                            {[property.suburb, property.state, property.postcode].filter(Boolean).join(', ')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs text-gray-600">
                      {property.propertyCode || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="p-4 capitalize text-gray-600">
                      {property.propertyType || 'Other'}
                    </td>
                    <td className="p-4 text-gray-700 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Building2 size={14} className="text-gray-400" />
                        {getAgencyName(property.realEstateAgencyId)}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2.5 text-xs font-semibold text-gray-600">
                        <span>{property.bedrooms || 0} Bed</span>
                        <span className="text-gray-200">|</span>
                        <span>{property.bathrooms || 0} Bath</span>
                        <span className="text-gray-200">|</span>
                        <span>{property.parking || 0} Car</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        property.status === 'active'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : property.status === 'inactive'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-gray-50 text-gray-700 border border-gray-200'
                      }`}>
                        {property.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        to={`/app/admin/properties/${property.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-accent-600 hover:text-accent-800 hover:underline"
                      >
                        <Eye size={12} /> View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertiesPage;
