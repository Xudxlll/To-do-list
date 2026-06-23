export const CLOUD_COLLECTIONS = {
  diaries: 'diaries',
  customOptions: 'custom_options',
  lockedPlans: 'locked_plans',
};

let cloudReady = false;

export function initCloud(): void {
  if (cloudReady) return;
  if (!wx.cloud) {
    throw new Error('当前基础库不支持 wx.cloud，请在微信开发者工具中启用云开发。');
  }
  wx.cloud.init({ traceUser: true });
  cloudReady = true;
}

export function getCloudDb(): DB.Database {
  initCloud();
  return wx.cloud.database();
}
