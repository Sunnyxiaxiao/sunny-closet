/**
 * 数据库类型定义，与 supabase/migrations 中的表结构保持一致。
 * 修改表结构时请同步修改这里。
 */

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "picked_up"
  | "returned"
  | "cancelled";

export type InventoryStatus = "available" | "inactive";

export type StyleCategory = "suit" | "one_piece" | "jacket" | "pants" | "helmet_cover" | "gloves";

export type HelmetCoverTier = "regular" | "premium";

export type ReviewStatus = "pending" | "published" | "hidden";

export type Database = {
  public: {
    Tables: {
      settings: {
        Row: {
          id: boolean;
          buffer_days: number;
          gloves_max_rental_days: number;
          max_rental_days: number;
          rental_prices_cents: number[];
          jacket_prices_cents: number[];
          pants_prices_cents: number[];
          /** Crystal 雪服正价表；特惠期内（今天 ≤ crystal_promo_ends_on）按普通价 */
          crystal_prices_cents: number[];
          crystal_jacket_prices_cents: number[];
          crystal_pants_prices_cents: number[];
          crystal_promo_ends_on: string | null;
          shipping_min_days: number;
          /** 滑雪日前后额外占用库存的天数（不收费）：到店自取前一晚取、次日还；邮寄提前寄出、用完寄回 */
          pickup_lead_days: number;
          pickup_tail_days: number;
          shipping_lead_days: number;
          shipping_tail_days: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          buffer_days?: number;
          gloves_max_rental_days?: number;
          max_rental_days?: number;
          rental_prices_cents?: number[];
          jacket_prices_cents?: number[];
          pants_prices_cents?: number[];
          crystal_prices_cents?: number[];
          crystal_jacket_prices_cents?: number[];
          crystal_pants_prices_cents?: number[];
          crystal_promo_ends_on?: string | null;
          shipping_min_days?: number;
          updated_at?: string;
        };
        Update: {
          buffer_days?: number;
          gloves_max_rental_days?: number;
          max_rental_days?: number;
          rental_prices_cents?: number[];
          jacket_prices_cents?: number[];
          pants_prices_cents?: number[];
          crystal_prices_cents?: number[];
          crystal_jacket_prices_cents?: number[];
          crystal_pants_prices_cents?: number[];
          crystal_promo_ends_on?: string | null;
          shipping_min_days?: number;
        };
        Relationships: [];
      };
      styles: {
        Row: {
          id: string;
          slug: string;
          brand: string;
          category: StyleCategory;
          name: string;
          description: string;
          daily_price_cents: number;
          deposit_cents: number;
          image_urls: string[];
          source_url: string;
          is_active: boolean;
          sort_order: number;
          tier: HelmetCoverTier | null;
          tags: string[];
          addon_price_cents: number | null;
          replacement_value_cents: number | null;
          /** 不为空时按款式自己的价目表计价，否则用 settings 的全店价目表 */
          rental_prices_cents: number[] | null;
          variant_images: Record<string, number>;
          /** 组合套装由哪几件单品（款式 id）组成；普通款式为 null */
          bundle_style_ids: string[] | null;
          name_en: string;
          description_en: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          brand?: string;
          category?: StyleCategory;
          name: string;
          description?: string;
          daily_price_cents: number;
          deposit_cents: number;
          image_urls?: string[];
          source_url?: string;
          is_active?: boolean;
          sort_order?: number;
          tier?: HelmetCoverTier | null;
          tags?: string[];
          addon_price_cents?: number | null;
          replacement_value_cents?: number | null;
          rental_prices_cents?: number[] | null;
          variant_images?: Record<string, number>;
          bundle_style_ids?: string[] | null;
          name_en?: string;
          description_en?: string;
        };
        Update: {
          slug?: string;
          brand?: string;
          category?: StyleCategory;
          name?: string;
          description?: string;
          daily_price_cents?: number;
          deposit_cents?: number;
          image_urls?: string[];
          source_url?: string;
          is_active?: boolean;
          sort_order?: number;
          tier?: HelmetCoverTier | null;
          tags?: string[];
          addon_price_cents?: number | null;
          replacement_value_cents?: number | null;
          rental_prices_cents?: number[] | null;
          variant_images?: Record<string, number>;
          bundle_style_ids?: string[] | null;
          name_en?: string;
          description_en?: string;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: {
          id: string;
          style_id: string;
          size: string;
          code: string;
          status: InventoryStatus;
          notes: string;
          /** 采购价（美分），没录入时为 null */
          purchase_cents: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          style_id: string;
          size: string;
          code: string;
          status?: InventoryStatus;
          notes?: string;
          purchase_cents?: number | null;
        };
        Update: {
          size?: string;
          code?: string;
          status?: InventoryStatus;
          notes?: string;
          purchase_cents?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_style_id_fkey";
            columns: ["style_id"];
            isOneToOne: false;
            referencedRelation: "styles";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          booking_no: string;
          style_id: string;
          inventory_item_id: string;
          size: string;
          start_date: string;
          end_date: string;
          buffer_days: number;
          /** 下单时记录的前置 / 后置天数（第一个滑雪日之前、最后一个之后占用库存的天数） */
          lead_days: number;
          tail_days: number;
          blocked_range: string;
          status: BookingStatus;
          fulfillment_method: "pickup" | "shipping";
          shipping_address: string | null;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          customer_note: string;
          rental_days: number;
          daily_price_cents: number;
          rental_cents: number;
          deposit_cents: number;
          total_cents: number;
          admin_note: string;
          /** 加购子订单指向它所属的雪服订单；普通订单为 null */
          parent_booking_id: string | null;
          /** 组合套装里的其他单品（0 元子订单），区别于头盔套加购 */
          bundle_part: boolean;
          /** 购物车订单里的第 2 件起（有自己的租金和押金，挂在第 1 件的主订单下面） */
          cart_item: boolean;
          /** 登录状态下提交的订单记在这个账号名下 */
          user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          status?: BookingStatus;
          admin_note?: string;
          /** 只有服务端（service_role）会写 */
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_style_id_fkey";
            columns: ["style_id"];
            isOneToOne: false;
            referencedRelation: "styles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          booking_id: string;
          style_id: string;
          rating: number;
          body: string;
          display_name: string;
          locale: "zh" | "en";
          status: ReviewStatus;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          style_id: string;
          rating: number;
          body: string;
          display_name: string;
          locale?: "zh" | "en";
          status?: ReviewStatus;
          published_at?: string | null;
        };
        Update: {
          status?: ReviewStatus;
          published_at?: string | null;
        };
        Relationships: [];
      };
      inventory_blocks: {
        Row: {
          id: string;
          inventory_item_id: string;
          start_date: string;
          end_date: string;
          reason: string;
          blocked_range: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          inventory_item_id: string;
          start_date: string;
          end_date: string;
          reason?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "inventory_blocks_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          user_id: string;
          full_name: string;
          phone: string;
          wechat: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          full_name?: string;
          phone?: string;
          wechat?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          phone?: string;
          wechat?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          user_id: string;
          email: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      get_availability: {
        Args: {
          p_start?: string | null;
          p_end?: string | null;
          p_style_id?: string | null;
          p_fulfillment_method?: "pickup" | "shipping";
        };
        Returns: {
          style_id: string;
          size: string;
          total_count: number;
          available_count: number;
        }[];
      };
      create_booking: {
        Args: {
          p_style_id: string;
          p_size: string;
          p_start: string;
          p_end: string;
          p_customer_name: string;
          p_customer_email: string;
          p_customer_phone: string;
          p_fulfillment_method: "pickup" | "shipping";
          p_shipping_address: string | null;
          p_customer_note: string;
          p_daily_price_cents: number;
          p_rental_cents: number;
          p_deposit_cents: number;
          /** 加购款式 id 与服务端算好的加购价，一一对应 */
          p_addon_style_ids?: string[];
          p_addon_cents?: number[];
        };
        Returns: {
          booking_id: string;
          booking_no: string;
          inventory_item_id: string;
        }[];
      };
      create_order: {
        Args: {
          /** 购物车每一件：款式、尺码、滑雪日、服务端算好的价格、加购的头盔套 */
          p_lines: {
            style_id: string;
            size: string;
            start: string;
            end: string;
            daily_price_cents: number;
            rental_cents: number;
            deposit_cents: number;
            addon_style_ids: string[];
            addon_cents: number[];
          }[];
          p_customer_name: string;
          p_customer_email: string;
          p_customer_phone: string;
          p_fulfillment_method: "pickup" | "shipping";
          p_shipping_address: string | null;
          p_customer_note: string;
        };
        Returns: { booking_id: string; booking_no: string }[];
      };
      rental_price_cents: {
        Args: { p_days: number };
        Returns: number;
      };
      style_rental_price_cents: {
        Args: { p_style_id: string; p_days: number };
        Returns: number;
      };
      hit_rate_limit: {
        Args: {
          p_bucket: string;
          p_key_hash: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      is_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type StyleRow = Database["public"]["Tables"]["styles"]["Row"];
export type InventoryItemRow = Database["public"]["Tables"]["inventory_items"]["Row"];
export type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
export type InventoryBlockRow = Database["public"]["Tables"]["inventory_blocks"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];
export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];
