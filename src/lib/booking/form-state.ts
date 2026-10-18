/** 预订表单提交后的状态（服务端动作与表单组件共用，所以单独放一个文件） */

export interface BookingFormValues {
  name: string;
  phone: string;
  email: string;
  wechat: string;
  fulfillment: string;
  shippingAddress: string;
  note: string;
}

export interface BookingFormState {
  /** 表单顶部的整体提示 */
  message?: string;
  /** 字段名 → 该字段的错误 */
  fieldErrors?: Record<string, string>;
  /** 提交失败时把顾客填过的内容带回去，避免重填 */
  values?: Partial<BookingFormValues>;
}

export const initialBookingFormState: BookingFormState = {};
