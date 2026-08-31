export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      brands: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_media_asset_id: string | null
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_media_asset_id?: string | null
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_media_asset_id?: string | null
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_image_media_asset_id_fkey"
            columns: ["image_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_media_asset_id: string | null
          is_active: boolean
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_media_asset_id?: string | null
          is_active?: boolean
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_media_asset_id?: string | null
          is_active?: boolean
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_image_media_asset_id_fkey"
            columns: ["image_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          current_quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          current_quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          current_quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          adjustment_type: Database["public"]["Enums"]["inventory_adjustment_type"]
          created_at: string
          created_by: string
          id: string
          order_id: string | null
          quantity_after: number
          quantity_before: number
          quantity_change: number
          reason: string | null
          variant_id: string
        }
        Insert: {
          adjustment_type: Database["public"]["Enums"]["inventory_adjustment_type"]
          created_at?: string
          created_by: string
          id?: string
          order_id?: string | null
          quantity_after: number
          quantity_before: number
          quantity_change: number
          reason?: string | null
          variant_id: string
        }
        Update: {
          adjustment_type?: Database["public"]["Enums"]["inventory_adjustment_type"]
          created_at?: string
          created_by?: string
          id?: string
          order_id?: string | null
          quantity_after?: number
          quantity_before?: number
          quantity_change?: number
          reason?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_order_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          asset_id: string | null
          bytes: number | null
          created_at: string
          created_by: string | null
          format: string | null
          height: number | null
          id: string
          public_id: string
          secure_url: string
          updated_at: string
          width: number | null
        }
        Insert: {
          asset_id?: string | null
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          format?: string | null
          height?: number | null
          id?: string
          public_id: string
          secure_url: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          asset_id?: string | null
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          format?: string | null
          height?: number | null
          id?: string
          public_id?: string
          secure_url?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      option_types: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      option_values: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          option_type_id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          option_type_id: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          option_type_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_values_option_type_id_fkey"
            columns: ["option_type_id"]
            isOneToOne: false
            referencedRelation: "option_types"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          brand_name: string | null
          id: string
          image_public_id: string | null
          image_secure_url: string | null
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          variant_id: string
          variant_name: string | null
          variant_options: Json
          variant_sku: string
        }
        Insert: {
          brand_name?: string | null
          id?: string
          image_public_id?: string | null
          image_secure_url?: string | null
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          variant_id: string
          variant_name?: string | null
          variant_options?: Json
          variant_sku: string
        }
        Update: {
          brand_name?: string | null
          id?: string
          image_public_id?: string | null
          image_secure_url?: string | null
          order_id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          variant_id?: string
          variant_name?: string | null
          variant_options?: Json
          variant_sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_preparation_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_request_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          display_number: string
          id: string
          request_fingerprint: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          assigned_preparation_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_request_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          display_number: string
          id?: string
          request_fingerprint: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          assigned_preparation_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_request_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          display_number?: string
          id?: string
          request_fingerprint?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_preparation_id_fkey"
            columns: ["assigned_preparation_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_media: {
        Row: {
          created_at: string
          display_order: number
          is_primary: boolean
          media_asset_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          is_primary?: boolean
          media_asset_id: string
          variant_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          is_primary?: boolean
          media_asset_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_media_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_media_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          low_stock_threshold: number | null
          product_id: string
          search_keywords: string[] | null
          sku: string
          title_override: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          low_stock_threshold?: number | null
          product_id: string
          search_keywords?: string[] | null
          sku?: string
          title_override?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          low_stock_threshold?: number | null
          product_id?: string
          search_keywords?: string[] | null
          sku?: string
          title_override?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          cover_media_asset_id: string | null
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          search_keywords: string[] | null
          short_description: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          cover_media_asset_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          search_keywords?: string[] | null
          short_description?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          cover_media_asset_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          search_keywords?: string[] | null
          short_description?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_cover_media_asset_id_fkey"
            columns: ["cover_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          created_at: string
          customer_success_reset_seconds: number
          global_low_stock_threshold: number
          id: boolean
          logo_media_asset_id: string | null
          store_name: string
          store_timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_success_reset_seconds?: number
          global_low_stock_threshold?: number
          id?: boolean
          logo_media_asset_id?: string | null
          store_name: string
          store_timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_success_reset_seconds?: number
          global_low_stock_threshold?: number
          id?: boolean
          logo_media_asset_id?: string | null
          store_name?: string
          store_timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_logo_media_asset_id_fkey"
            columns: ["logo_media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_option_values: {
        Row: {
          created_at: string
          option_type_id: string
          option_value_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          option_type_id: string
          option_value_id: string
          variant_id: string
        }
        Update: {
          created_at?: string
          option_type_id?: string
          option_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_option_values_option_type_id_fkey"
            columns: ["option_type_id"]
            isOneToOne: false
            referencedRelation: "option_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_option_values_value_type_fkey"
            columns: ["option_value_id", "option_type_id"]
            isOneToOne: false
            referencedRelation: "option_values"
            referencedColumns: ["id", "option_type_id"]
          },
          {
            foreignKeyName: "variant_option_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_update_profile: {
        Args: { actor_id: string; changes: Json; target_id: string }
        Returns: {
          display_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }[]
      }
      apply_inventory_adjustment: {
        Args: {
          delta: number
          reason: string
          type: Database["public"]["Enums"]["inventory_adjustment_type"]
          variant_id: string
        }
        Returns: Json
      }
      create_order: {
        Args: { client_request_id: string; items: Json }
        Returns: Json
      }
      current_active_profile: {
        Args: never
        Returns: {
          display_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_customer_catalog: { Args: never; Returns: Json }
      get_media_asset_usage: {
        Args: { target_media_asset_id: string }
        Returns: Json
      }
      reorder_items: {
        Args: { ordered_ids: string[]; resource_name: string; scope_id: string }
        Returns: undefined
      }
      search_admin_profiles: {
        Args: { page_offset?: number; page_size?: number; search_term: string }
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          total_count: number
        }[]
      }
      set_inventory_quantity: {
        Args: { final_quantity: number; reason: string; variant_id: string }
        Returns: Json
      }
      update_order_status: {
        Args: {
          order_id: string
          reason?: string
          target_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "preparation" | "customer"
      inventory_adjustment_type:
        | "initial_stock"
        | "stock_received"
        | "manual_increase"
        | "manual_decrease"
        | "damaged_or_expired"
        | "order_deduction"
        | "order_cancellation_restoration"
      order_status: "new" | "preparing" | "ready" | "completed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "preparation", "customer"],
      inventory_adjustment_type: [
        "initial_stock",
        "stock_received",
        "manual_increase",
        "manual_decrease",
        "damaged_or_expired",
        "order_deduction",
        "order_cancellation_restoration",
      ],
      order_status: ["new", "preparing", "ready", "completed", "cancelled"],
    },
  },
} as const
