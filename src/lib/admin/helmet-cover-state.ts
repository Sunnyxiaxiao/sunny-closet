/** 后台头盔套表单提交后的状态（服务端动作与表单组件共用） */
export interface HelmetCoverFormState {
  message?: string;
  fieldErrors?: Record<string, string>;
  /** 保存失败时把填过的文字带回去（React 提交后会重置表单） */
  values?: Record<string, string>;
}

export const initialHelmetCoverFormState: HelmetCoverFormState = {};
