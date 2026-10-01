export const PERMISSIONS = [
    ['view_dashboard', 'View dashboard'],
    ['enter_readings', 'Add daily readings'],
    ['edit_readings', 'Edit previous readings'],
    ['view_reports', 'View reports'],
    ['manage_company_users', 'Manage company users'],
];

export const METERS = [
    ['plant_import', 'Plant Import'],
    ['plant_export', 'Plant Export'],
    ['sub_import', '66kV Sub Import'],
    ['sub_export', '66kV Sub Export'],
];

export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => `${today().slice(0, 7)}-01`;
