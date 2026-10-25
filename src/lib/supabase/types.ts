/**
 * Authoritative TypeScript Database schema definitions for The Hunt Expedition.
 * Mirrors supabase/migrations/20261025000000_phase1_core.sql exactly.
 * Complies with @supabase/supabase-js GenericSchema contract.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      event_config: {
        Row: {
          id: number;
          status: "draft" | "active" | "paused" | "completed";
          start_at: string | null;
          end_at: string | null;
          is_locked: boolean;
          winner_team_id: string | null;
          updated_at: string;
        };
        Insert: {
          id?: number;
          status?: "draft" | "active" | "paused" | "completed";
          start_at?: string | null;
          end_at?: string | null;
          is_locked?: boolean;
          winner_team_id?: string | null;
          updated_at?: string;
        };
        Update: {
          status?: "draft" | "active" | "paused" | "completed";
          start_at?: string | null;
          end_at?: string | null;
          is_locked?: boolean;
          winner_team_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      levels: {
        Row: {
          level_number: number;
          name: string;
          codename: string;
          required_questions: number;
          hints_allocated: number;
        };
        Insert: {
          level_number: number;
          name: string;
          codename: string;
          required_questions: number;
          hints_allocated?: number;
        };
        Update: {
          name?: string;
          codename?: string;
          required_questions?: number;
          hints_allocated?: number;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          level_number: number;
          order_seq: number;
          title: string;
          prompt: string;
          cipher_type: string;
          cipher_payload: string | null;
          coordinates_hint: string | null;
          dependency_question_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          level_number: number;
          order_seq: number;
          title: string;
          prompt: string;
          cipher_type: string;
          cipher_payload?: string | null;
          coordinates_hint?: string | null;
          dependency_question_id?: string | null;
          created_at?: string;
        };
        Update: {
          level_number?: number;
          order_seq?: number;
          title?: string;
          prompt?: string;
          cipher_type?: string;
          cipher_payload?: string | null;
          coordinates_hint?: string | null;
          dependency_question_id?: string | null;
        };
        Relationships: [];
      };
      question_keys: {
        Row: {
          question_id: string;
          answer_hash: string;
          created_at: string;
        };
        Insert: {
          question_id: string;
          answer_hash: string;
          created_at?: string;
        };
        Update: {
          answer_hash?: string;
        };
        Relationships: [];
      };
      hints: {
        Row: {
          id: string;
          question_id: string;
          level_number: number;
          hint_number: number;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          level_number: number;
          hint_number: number;
          content: string;
          created_at?: string;
        };
        Update: {
          question_id?: string;
          level_number?: number;
          hint_number?: number;
          content?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          team_name: string;
          callsign: string;
          password_hash: string;
          is_disqualified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_name: string;
          callsign: string;
          password_hash: string;
          is_disqualified?: boolean;
          created_at?: string;
        };
        Update: {
          team_name?: string;
          callsign?: string;
          password_hash?: string;
          is_disqualified?: boolean;
        };
        Relationships: [];
      };
      team_progress: {
        Row: {
          id: string;
          team_id: string;
          question_id: string;
          level_number: number;
          solved_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          question_id: string;
          level_number: number;
          solved_at?: string;
        };
        Update: {
          team_id?: string;
          question_id?: string;
          level_number?: number;
        };
        Relationships: [];
      };
      team_hints: {
        Row: {
          id: string;
          team_id: string;
          hint_id: string;
          question_id: string;
          level_number: number;
          revealed_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          hint_id: string;
          question_id: string;
          level_number: number;
          revealed_at?: string;
        };
        Update: {
          team_id?: string;
          hint_id?: string;
          question_id?: string;
          level_number?: number;
        };
        Relationships: [];
      };
      auth_rate_limits: {
        Row: {
          identifier_type: "account" | "ip";
          identifier_key: string;
          failed_attempts: number;
          window_start_at: string;
          locked_until: string | null;
        };
        Insert: {
          identifier_type: "account" | "ip";
          identifier_key: string;
          failed_attempts?: number;
          window_start_at?: string;
          locked_until?: string | null;
        };
        Update: {
          failed_attempts?: number;
          window_start_at?: string;
          locked_until?: string | null;
        };
        Relationships: [];
      };
      team_sessions: {
        Row: {
          id: string;
          team_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          revoked_at?: string | null;
          expires_at?: string;
        };
        Relationships: [];
      };
      marshals: {
        Row: {
          id: string;
          username: string;
          callsign: string;
          password_hash: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          callsign: string;
          password_hash: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          username?: string;
          callsign?: string;
          password_hash?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      marshal_sessions: {
        Row: {
          id: string;
          marshal_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          marshal_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          revoked_at?: string | null;
          expires_at?: string;
        };
        Relationships: [];
      };
      treasure_secrets: {
        Row: {
          id: number;
          token_verifier: string;
          is_claimed: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          token_verifier: string;
          is_claimed?: boolean;
          created_at?: string;
        };
        Update: {
          token_verifier?: string;
          is_claimed?: boolean;
        };
        Relationships: [];
      };
      winner_verifications: {
        Row: {
          id: string;
          event_id: number;
          winning_team_id: string;
          verified_by_marshal_id: string;
          verified_at: string;
          token_masked: string;
        };
        Insert: {
          id?: string;
          event_id?: number;
          winning_team_id: string;
          verified_by_marshal_id: string;
          verified_at?: string;
          token_masked: string;
        };
        Update: {
          token_masked?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      authenticate_team: {
        Args: {
          p_team_identifier: string;
          p_password: string;
          p_client_ip: string;
        };
        Returns: Json;
      };
      authenticate_marshal: {
        Args: {
          p_username: string;
          p_password: string;
          p_client_ip: string;
        };
        Returns: Json;
      };
      revoke_team_session: {
        Args: {
          p_session_token: string;
        };
        Returns: boolean;
      };
      revoke_marshal_session: {
        Args: {
          p_marshal_session_token: string;
        };
        Returns: boolean;
      };
      internal_validate_team_session: {
        Args: {
          p_session_token: string;
        };
        Returns: string | null;
      };
      internal_validate_marshal_session: {
        Args: {
          p_session_token: string;
        };
        Returns: string | null;
      };
      submit_team_answer: {
        Args: {
          p_session_token: string;
          p_question_id: string;
          p_submitted_answer: string;
        };
        Returns: Json;
      };
      request_reveal_hint: {
        Args: {
          p_session_token: string;
          p_hint_id: string;
        };
        Returns: Json;
      };
      marshal_verify_treasure: {
        Args: {
          p_marshal_session_token: string;
          p_team_callsign: string;
          p_raw_token: string;
        };
        Returns: Json;
      };
      get_public_winner: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
