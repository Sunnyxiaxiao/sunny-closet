/** 结算表单提交后的状态（服务端动作与表单组件共用，所以单独放一个文件） */

export interface BookingFormValues {
  name: string;
  phone: string;
  email: string;
  wechat: string;
  fulfillment: string;
  shippingStreet: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  note: string;
}

export interface BookingFormState {
  /** 表单顶部的整体提示 */
  message?: string;
  /** 字段名 → 该字段的错误 */
  fieldErrors?: Record<string, string>;
  /** 提交失败时把顾客填过的内容带回去，避免重填 */
  values?: Partial<BookingFormValues>;
  /** 提交成功：预订详情页的地址（页面清空购物车后跳过去） */
  redirectTo?: string;
}

export const initialBookingFormState: BookingFormState = {};
