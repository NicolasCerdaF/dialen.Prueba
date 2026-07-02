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
      ai_insights: {
        Row: {
          churn_risk: number | null
          company_id: string
          created_at: string
          customer_id: string
          id: string
          intent: string | null
          last_analysis_at: string
          next_best_action: string | null
          probability: number | null
          quality_score: number | null
          sentiment: string | null
          signals: Json
          updated_at: string
        }
        Insert: {
          churn_risk?: number | null
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          intent?: string | null
          last_analysis_at?: string
          next_best_action?: string | null
          probability?: number | null
          quality_score?: number | null
          sentiment?: string | null
          signals?: Json
          updated_at?: string
        }
        Update: {
          churn_risk?: number | null
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          intent?: string | null
          last_analysis_at?: string
          next_best_action?: string | null
          probability?: number | null
          quality_score?: number | null
          sentiment?: string | null
          signals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestions: {
        Row: {
          actor_id: string | null
          agent_type: string
          company_id: string
          confidence: number | null
          conversation_id: string
          created_at: string
          customer_id: string | null
          id: string
          intent: string | null
          message_id: string
          model: string | null
          next_step: string | null
          objections: Json
          payload: Json
          probability: number | null
          sources: Json
          status: Database["public"]["Enums"]["suggestion_status"]
          text: string
          used_at: string | null
        }
        Insert: {
          actor_id?: string | null
          agent_type?: string
          company_id: string
          confidence?: number | null
          conversation_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          intent?: string | null
          message_id: string
          model?: string | null
          next_step?: string | null
          objections?: Json
          payload?: Json
          probability?: number | null
          sources?: Json
          status?: Database["public"]["Enums"]["suggestion_status"]
          text: string
          used_at?: string | null
        }
        Update: {
          actor_id?: string | null
          agent_type?: string
          company_id?: string
          confidence?: number | null
          conversation_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          intent?: string | null
          message_id?: string
          model?: string | null
          next_step?: string | null
          objections?: Json
          payload?: Json
          probability?: number | null
          sources?: Json
          status?: Database["public"]["Enums"]["suggestion_status"]
          text?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          actions_result: Json
          automation_id: string
          company_id: string
          conversation_id: string | null
          customer_id: string | null
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          skip_reason: string | null
          started_at: string
          status: string
          trigger_payload: Json | null
          triggered_by: string
        }
        Insert: {
          actions_result?: Json
          automation_id: string
          company_id: string
          conversation_id?: string | null
          customer_id?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          skip_reason?: string | null
          started_at?: string
          status: string
          trigger_payload?: Json | null
          triggered_by: string
        }
        Update: {
          actions_result?: Json
          automation_id?: string
          company_id?: string
          conversation_id?: string | null
          customer_id?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          skip_reason?: string | null
          started_at?: string
          status?: string
          trigger_payload?: Json | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_versions: {
        Row: {
          automation_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          snapshot: Json
          version: number
        }
        Insert: {
          automation_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot: Json
          version: number
        }
        Update: {
          automation_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "automation_versions_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          avg_duration_ms: number | null
          company_id: string
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          error_count: number
          id: string
          last_error: string | null
          last_run_at: string | null
          name: string
          run_count: number
          status: string
          trigger: Json
          updated_at: string
          version: number
        }
        Insert: {
          actions?: Json
          avg_duration_ms?: number | null
          company_id: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          error_count?: number
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name: string
          run_count?: number
          status?: string
          trigger?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          actions?: Json
          avg_duration_ms?: number | null
          company_id?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          error_count?: number
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          name?: string
          run_count?: number
          status?: string
          trigger?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "automations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          ai_auto_reply: boolean
          ai_confidence_threshold: number
          ai_custom_prompt: string | null
          ai_personality: Database["public"]["Enums"]["ai_personality"]
          ai_response_style: string
          created_at: string
          demo_mode: boolean
          id: string
          language: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          ai_auto_reply?: boolean
          ai_confidence_threshold?: number
          ai_custom_prompt?: string | null
          ai_personality?: Database["public"]["Enums"]["ai_personality"]
          ai_response_style?: string
          created_at?: string
          demo_mode?: boolean
          id?: string
          language?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          ai_auto_reply?: boolean
          ai_confidence_threshold?: number
          ai_custom_prompt?: string | null
          ai_personality?: Database["public"]["Enums"]["ai_personality"]
          ai_response_style?: string
          created_at?: string
          demo_mode?: boolean
          id?: string
          language?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_events: {
        Row: {
          actor_id: string | null
          company_id: string
          conversation_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          conversation_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          conversation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_notes: {
        Row: {
          author_id: string | null
          body: string
          company_id: string
          conversation_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          company_id: string
          conversation_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          company_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_paused: boolean
          assignee_id: string | null
          channel_id: string | null
          company_id: string
          created_at: string
          customer_id: string
          id: string
          is_demo: boolean
          last_message_at: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
        }
        Insert: {
          ai_paused?: boolean
          assignee_id?: string | null
          channel_id?: string | null
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          is_demo?: boolean
          last_message_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          ai_paused?: boolean
          assignee_id?: string | null
          channel_id?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_demo?: boolean
          last_message_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_events: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string
          customer_id: string
          event_type: string
          id: string
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          created_at?: string
          customer_id: string
          event_type: string
          id?: string
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string
          event_type?: string
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          author_id: string | null
          body: string
          company_id: string
          created_at: string
          customer_id: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          assignee_id: string | null
          channel: string | null
          company: string | null
          company_id: string
          created_at: string
          custom_fields: Json | null
          email: string | null
          estimated_value: number | null
          id: string
          last_interaction_at: string | null
          name: string | null
          next_activity_at: string | null
          notes: string | null
          phone: string
          position: string | null
          priority: string | null
          stage: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          channel?: string | null
          company?: string | null
          company_id: string
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          last_interaction_at?: string | null
          name?: string | null
          next_activity_at?: string | null
          notes?: string | null
          phone: string
          position?: string | null
          priority?: string | null
          stage?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          channel?: string | null
          company?: string | null
          company_id?: string
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          estimated_value?: number | null
          id?: string
          last_interaction_at?: string | null
          name?: string | null
          next_activity_at?: string | null
          notes?: string | null
          phone?: string
          position?: string | null
          priority?: string | null
          stage?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string | null
          type: string | null
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string | null
          type?: string | null
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string | null
          type?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          company_id: string
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          id: string
          media_url: string | null
          sender_id: string | null
          status: Database["public"]["Enums"]["message_status"]
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          company_id: string
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          id?: string
          media_url?: string | null
          sender_id?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: string
          media_url?: string | null
          sender_id?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_customers: {
        Row: {
          company_id: string
          context: string
          conversation_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          estimated_value: number | null
          id: string
          metadata: Json
          notes: string | null
          product_id: string
          quantity: number
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          context?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          estimated_value?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          product_id: string
          quantity?: number
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          context?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          estimated_value?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          product_id?: string
          quantity?: number
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_customers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recommendations: {
        Row: {
          agent_type: string
          company_id: string
          context: Json
          conversation_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          probability: number | null
          product_id: string
          reason: string | null
          reason_code: string | null
          resolved_at: string | null
          score: number | null
          signals: Json
          stage: string | null
          status: string
        }
        Insert: {
          agent_type?: string
          company_id: string
          context?: Json
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          probability?: number | null
          product_id: string
          reason?: string | null
          reason_code?: string | null
          resolved_at?: string | null
          score?: number | null
          signals?: Json
          stage?: string | null
          status?: string
        }
        Update: {
          agent_type?: string
          company_id?: string
          context?: Json
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          probability?: number | null
          product_id?: string
          reason?: string | null
          reason_code?: string | null
          resolved_at?: string | null
          score?: number | null
          signals?: Json
          stage?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_recommendations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recommendations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recommendations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recommendations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          ai_recommendable: boolean
          category: string | null
          company_id: string
          cost: number
          created_at: string
          created_by: string | null
          currency: string
          custom_fields: Json
          description: string | null
          id: string
          images: Json
          low_stock_threshold: number | null
          name: string
          price: number
          sku: string | null
          stock: number | null
          tags: string[]
          track_stock: boolean
          updated_at: string
          variants: Json
        }
        Insert: {
          active?: boolean
          ai_recommendable?: boolean
          category?: string | null
          company_id: string
          cost?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_fields?: Json
          description?: string | null
          id?: string
          images?: Json
          low_stock_threshold?: number | null
          name: string
          price?: number
          sku?: string | null
          stock?: number | null
          tags?: string[]
          track_stock?: boolean
          updated_at?: string
          variants?: Json
        }
        Update: {
          active?: boolean
          ai_recommendable?: boolean
          category?: string | null
          company_id?: string
          cost?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_fields?: Json
          description?: string | null
          id?: string
          images?: Json
          low_stock_threshold?: number | null
          name?: string
          price?: number
          sku?: string | null
          stock?: number | null
          tags?: string[]
          track_stock?: boolean
          updated_at?: string
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_links: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          purpose: string | null
          title: string
          url: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          purpose?: string | null
          title: string
          url: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          purpose?: string | null
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_channels: {
        Row: {
          access_token: string | null
          business_account_id: string | null
          company_id: string
          connected_at: string | null
          created_at: string
          display_phone: string | null
          id: string
          phone_number_id: string | null
          status: Database["public"]["Enums"]["channel_status"]
          updated_at: string
          webhook_verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          business_account_id?: string | null
          company_id: string
          connected_at?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          phone_number_id?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          business_account_id?: string | null
          company_id?: string
          connected_at?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          phone_number_id?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          webhook_verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager_or_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      ai_personality:
        | "vendedor_experto"
        | "consultor"
        | "tecnico"
        | "cercano"
        | "custom"
      app_role: "admin" | "manager" | "vendedor"
      channel_status: "disconnected" | "pending" | "connected" | "error"
      conversation_status: "open" | "pending" | "closed" | "archived"
      document_status: "uploading" | "processing" | "ready" | "failed"
      message_direction: "inbound" | "outbound"
      message_status: "pending" | "sent" | "delivered" | "read" | "failed"
      suggestion_status: "pending" | "used" | "edited" | "discarded"
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
      ai_personality: [
        "vendedor_experto",
        "consultor",
        "tecnico",
        "cercano",
        "custom",
      ],
      app_role: ["admin", "manager", "vendedor"],
      channel_status: ["disconnected", "pending", "connected", "error"],
      conversation_status: ["open", "pending", "closed", "archived"],
      document_status: ["uploading", "processing", "ready", "failed"],
      message_direction: ["inbound", "outbound"],
      message_status: ["pending", "sent", "delivered", "read", "failed"],
      suggestion_status: ["pending", "used", "edited", "discarded"],
    },
  },
} as const
