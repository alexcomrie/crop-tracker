// artifacts/cropmanager-pwa/src/lib/config.ts

export const CONFIG = {
  // Hardcoded Spreadsheet ID
  SPREADSHEET_ID: '1TGpt9rvRUeQwnSxo6n8X271VeZW2m4m4nYwsi8iHBx8',
  
  // Hardcoded Sync Web App URL
  SYNC_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbzSZhdgpaO_AAv6zWJxRKtIOWlzI4mqRzFP7jKSp_8-9PkT-qwCoHJT7qaEMG-5sFlLEA/exec',
  
  // Hardcoded Sync Token (if still needed by the script)
  SYNC_TOKEN: 'CropMgr_Alex_2026',
};

// Function to get a direct CSV pull URL for a sheet
export function getPublishedCsvUrl(gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/pub?gid=${gid}&output=csv`;
}
