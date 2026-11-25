//! Authentication: shared types and constants.

use std::str::FromStr;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub mod guard;
pub mod limit;
pub mod password;
pub mod sessions;
pub mod tokens;

pub const ACCESS_TTL_SECS: i64 = 900;
pub const REFRESH_TTL_SECS: i64 = 2_592_000;
pub const PAIRING_TTL_SECS: i64 = 600;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Owner,
    Admin,
    Member,
    Guest,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Owner => "owner",
            Role::Admin => "admin",
            Role::Member => "member",
            Role::Guest => "guest",
        }
    }

    fn rank(&self) -> u8 {
        match self {
            Role::Owner => 3,
            Role::Admin => 2,
            Role::Member => 1,
            Role::Guest => 0,
        }
    }

    pub fn at_least(&self, min: Role) -> bool {
        self.rank() >= min.rank()
    }
}

impl FromStr for Role {
    type Err = String;

    fn from_str(s: &str) -> Result<Role, String> {
        match s {
            "owner" => Ok(Role::Owner),
            "admin" => Ok(Role::Admin),
            "member" => Ok(Role::Member),
            "guest" => Ok(Role::Guest),
            other => Err(format!("unknown role: {other}")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DeviceKind {
    Desktop,
    Mobile,
}

impl DeviceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            DeviceKind::Desktop => "desktop",
            DeviceKind::Mobile => "mobile",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub library_id: String,
    pub user_id: String,
    pub device_id: String,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Session {
    pub device_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
}
