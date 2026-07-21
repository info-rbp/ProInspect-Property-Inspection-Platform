import { initPlatformDB } from './localPlatformStore';
import { initLocalDB } from '../storageService';
import type { PropertyRecord, InspectionJob, ReportIndex } from '../../types/platform';
import type { ReportData } from '../../types';

export const seedMockData = async (): Promise<void> => {
  const platformDb = await initPlatformDB();
  const reportsDb = await initLocalDB();

  // Check if properties exist
  const existingProperties = await platformDb.getAll('properties');
  if (existingProperties && existingProperties.length > 0) {
    // Already seeded or has data
    return;
  }

  const timestamp = new Date().toISOString();

  // 1. Seed Properties
  const mockProperties: PropertyRecord[] = [
    {
      id: 'prop-1',
      agencyId: 'unprovisioned-agency',
      address: '128 Albert Street',
      suburb: 'Brisbane City',
      state: 'QLD',
      postcode: '4000',
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 2,
      parking: 1,
      clientIds: ['client-1'],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'prop-2',
      agencyId: 'unprovisioned-agency',
      address: '45 Cooper Street',
      suburb: 'Surry Hills',
      state: 'NSW',
      postcode: '2010',
      propertyType: 'townhouse',
      bedrooms: 3,
      bathrooms: 2,
      parking: 2,
      clientIds: ['client-2'],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'prop-3',
      agencyId: 'unprovisioned-agency',
      address: '88 St Georges Terrace',
      suburb: 'Perth',
      state: 'WA',
      postcode: '6000',
      propertyType: 'house',
      bedrooms: 4,
      bathrooms: 3,
      parking: 2,
      clientIds: ['client-3'],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];

  for (const prop of mockProperties) {
    await platformDb.put('properties', prop);
  }

  // 2. Seed Clients
  const mockClients = [
    {
      id: 'client-1',
      agencyId: 'unprovisioned-agency',
      name: 'Sarah Jenkins',
      email: 'sarah.jenkins@example.com',
      phone: '0412 345 678',
      type: 'landlord',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'client-2',
      agencyId: 'unprovisioned-agency',
      name: 'Robert Chen',
      email: 'robert.chen@example.com',
      phone: '0423 456 789',
      type: 'owner',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];

  for (const client of mockClients) {
    await platformDb.put('clients', client);
  }

  // 3. Seed Inspection Jobs
  const mockJobs: InspectionJob[] = [
    {
      id: 'job-1',
      agencyId: 'unprovisioned-agency',
      propertyId: 'prop-1',
      tenancyId: 'tenancy-1',
      reportId: 'report-1',
      reportType: 'Property Condition Report',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      assignedInspectorId: 'proinspect-mock-admin-uid',
      status: 'assigned',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'job-2',
      agencyId: 'unprovisioned-agency',
      propertyId: 'prop-2',
      tenancyId: 'tenancy-2',
      reportId: 'report-2',
      reportType: 'Routine Inspection',
      scheduledAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      assignedInspectorId: 'proinspect-mock-admin-uid',
      status: 'inspection_submitted',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];

  for (const job of mockJobs) {
    await platformDb.put('inspectionJobs', job);
  }

  // 4. Seed Report Indexes
  const mockReportIndexes: ReportIndex[] = [
    {
      id: 'report-1',
      reportId: 'report-1',
      agencyId: 'unprovisioned-agency',
      propertyId: 'prop-1',
      tenancyId: 'tenancy-1',
      inspectionJobId: 'job-1',
      reportType: 'Property Condition Report',
      propertyAddress: '128 Albert Street, Brisbane City QLD 4000',
      clientName: 'Sarah Jenkins',
      tenantName: 'John Doe',
      inspectionDate: new Date().toISOString().split('T')[0],
      lifecycleStatus: 'draft',
      ownerUid: 'proinspect-mock-admin-uid',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'report-2',
      reportId: 'report-2',
      agencyId: 'unprovisioned-agency',
      propertyId: 'prop-2',
      tenancyId: 'tenancy-2',
      inspectionJobId: 'job-2',
      reportType: 'Routine Inspection',
      propertyAddress: '45 Cooper Street, Surry Hills NSW 2010',
      clientName: 'Robert Chen',
      tenantName: 'Alice Smith',
      inspectionDate: new Date(Date.now() - 172800000).toISOString().split('T')[0],
      lifecycleStatus: 'review_required',
      ownerUid: 'proinspect-mock-admin-uid',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];

  for (const index of mockReportIndexes) {
    await platformDb.put('reportIndexes', index);
  }

  // 5. Seed Full Reports in Reports DB
  const mockReports: ReportData[] = [
    {
      id: 'report-1',
      agencyId: 'unprovisioned-agency',
      propertyId: 'prop-1',
      tenancyId: 'tenancy-1',
      inspectionJobId: 'job-1',
      lifecycleStatus: 'draft',
      propertyAddress: '128 Albert Street, Brisbane City QLD 4000',
      agentName: 'ProInspect Admin',
      agentCompany: 'ProInspect Systems',
      agentEmail: 'info@proinspect.systems',
      clientName: 'Sarah Jenkins',
      tenantName: 'John Doe',
      inspectionDate: new Date().toISOString().split('T')[0],
      reportType: 'Property Condition Report',
      rooms: [
        {
          id: 'room-1',
          name: 'Entry / Foyer',
          status: 'draft',
          overallComment: 'Entry is in good condition overall. High-traffic area, minor scuffs on the bottom skirting board.',
          items: [
            { id: 'item-1-1', name: 'Front door & Lock', isClean: true, isUndamaged: true, isWorking: true, comment: 'Door is secure and opens smoothly.' },
            { id: 'item-1-2', name: 'Walls & Skirting', isClean: true, isUndamaged: false, isWorking: true, comment: 'Minor scuff marks near floor level.' },
            { id: 'item-1-3', name: 'Light fittings', isClean: true, isUndamaged: true, isWorking: true, comment: 'All bulbs operational.' },
          ],
          photos: [],
        },
        {
          id: 'room-2',
          name: 'Living Room',
          status: 'draft',
          overallComment: 'Spacious room, clean carpet and freshly painted walls. Air conditioning is clean and working.',
          items: [
            { id: 'item-2-1', name: 'Flooring / Carpet', isClean: true, isUndamaged: true, isWorking: true, comment: 'Steam cleaned, no visible stains.' },
            { id: 'item-2-2', name: 'Windows & Screens', isClean: true, isUndamaged: true, isWorking: true, comment: 'Intact and sliding properly.' },
            { id: 'item-2-3', name: 'Air Conditioner', isClean: true, isUndamaged: true, isWorking: true, comment: 'Filters cleaned, remote present.' },
          ],
          photos: [],
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'report-2',
      agencyId: 'unprovisioned-agency',
      propertyId: 'prop-2',
      tenancyId: 'tenancy-2',
      inspectionJobId: 'job-2',
      lifecycleStatus: 'review_required',
      propertyAddress: '45 Cooper Street, Surry Hills NSW 2010',
      agentName: 'ProInspect Admin',
      agentCompany: 'ProInspect Systems',
      agentEmail: 'info@proinspect.systems',
      clientName: 'Robert Chen',
      tenantName: 'Alice Smith',
      inspectionDate: new Date(Date.now() - 172800000).toISOString().split('T')[0],
      reportType: 'Routine Inspection',
      rooms: [
        {
          id: 'room-2-1',
          name: 'Kitchen',
          status: 'complete',
          overallComment: 'Kitchen is mostly clean. Oven and cooktop have slight grease build-up. Rangehood light needs replacement.',
          items: [
            { id: 'item-2-1-1', name: 'Oven & Cooktop', isClean: false, isUndamaged: true, isWorking: true, comment: 'Requires light cleaning.' },
            { id: 'item-2-1-2', name: 'Benchtops & Splashback', isClean: true, isUndamaged: true, isWorking: true, comment: 'Stone surface intact.' },
            { id: 'item-2-1-3', name: 'Taps & Sink', isClean: true, isUndamaged: true, isWorking: true, comment: 'No leaks, good water pressure.' },
            { id: 'item-2-1-4', name: 'Rangehood', isClean: true, isUndamaged: true, isWorking: false, comment: 'Light bulb blown; fan works fine.' },
          ],
          photos: [],
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];

  for (const report of mockReports) {
    await reportsDb.put('reports', report);
  }
};
