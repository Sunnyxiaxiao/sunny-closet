/** 登录、注册、重设密码、资料表单提交后的状态（服务端动作与表单组件共用） */
export interface AccountFormState {
  /** 表单顶部的提示 */
  message?: string;
  /** 成功提示（例如“已保存”“请查收邮件”） */
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** 提交失败时带回去的内容（React 提交后会重置表单） */
  values?: Record<string, string>;
}

export const initialAccountFormState: AccountFormState = {};
