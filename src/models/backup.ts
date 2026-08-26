import { getCredentials } from "./credentials";
import { Encryption } from "./encryption";
import { UserSettings } from "./settings";
import { EntryStorage } from "./storage";

/** Fixed filename for the sync manifest in cloud storage */
const SYNC_FILENAME = "GenZ-Authenticator-sync.enc";

export class Dropbox implements BackupProvider {
  private async getToken() {
    await UserSettings.updateItems();
    return UserSettings.items.dropboxToken || "";
  }

  async upload(encryption: Encryption) {
    await UserSettings.updateItems();

    if (UserSettings.items.dropboxEncrypted === undefined) {
      // Encrypt by default if user hasn't set yet
      UserSettings.items.dropboxEncrypted = true;
      UserSettings.commitItems();
    }
    const exportData = await EntryStorage.backupGetExport(
      encryption,
      UserSettings.items.dropboxEncrypted === true
    );
    const backup = JSON.stringify(exportData, null, 2);

    const url = "https://content.dropboxapi.com/2/files/upload";
    const token = await this.getToken();
    return new Promise(
      (resolve: (value: boolean) => void, reject: (reason: Error) => void) => {
        if (!token) {
          return resolve(false);
        }
        try {
          const xhr = new XMLHttpRequest();
          const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          const apiArg = {
            path: `/${now}.json`,
            mode: "add",
            autorename: true,
          };
          xhr.open("POST", url);
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.setRequestHeader("Content-type", "application/octet-stream");
          xhr.setRequestHeader("Dropbox-API-Arg", JSON.stringify(apiArg));
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 401) {
                UserSettings.items.dropboxToken = undefined;
                UserSettings.items.dropboxRevoked = true;
                UserSettings.commitItems();
                return resolve(false);
              }
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.name) {
                  resolve(true);
                } else {
                  resolve(false);
                }
              } catch (error) {
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send(backup);
        } catch (error) {
          return reject(error as Error);
        }
      }
    );
  }
  async getUser() {
    await UserSettings.updateItems();
    const url = "https://api.dropboxapi.com/2/users/get_current_account";
    const token = await this.getToken();
    return new Promise((resolve: (value: string) => void) => {
      if (!token) {
        return resolve("Error: No token");
      }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 401) {
            UserSettings.items.dropboxToken = undefined;
            UserSettings.items.dropboxRevoked = true;
            UserSettings.commitItems();
            resolve(
              "Error: Response was 401. You will be logged out the next time you open GenZ-Authenticator."
            );
          }
          try {
            const res = JSON.parse(xhr.responseText);
            if (res.email) {
              resolve(res.email);
            } else {
              console.error("Could not find email in response.", res);
              resolve("Error: res.email was undefined.");
            }
          } catch (e) {
            console.error(e);
            resolve("Error");
          }
        }
        return;
      };
      xhr.send(null);
    });
  }

  async uploadSync(payload: SyncPayload): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;

    const url = "https://content.dropboxapi.com/2/files/upload";
    const apiArg = {
      path: `/${SYNC_FILENAME}`,
      mode: "overwrite",
      autorename: false,
    };

    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.setRequestHeader("Content-type", "application/octet-stream");
        xhr.setRequestHeader("Dropbox-API-Arg", JSON.stringify(apiArg));
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 401) {
              UserSettings.items.dropboxToken = undefined;
              UserSettings.items.dropboxRevoked = true;
              UserSettings.commitItems();
              return resolve(false);
            }
            try {
              const res = JSON.parse(xhr.responseText);
              resolve(Boolean(res.name));
            } catch (error) {
              reject(error as Error);
            }
          }
        };
        xhr.send(JSON.stringify(payload));
      } catch (error) {
        reject(error as Error);
      }
    });
  }

  async downloadSync(): Promise<SyncPayload | null> {
    const token = await this.getToken();
    if (!token) return null;

    const url = "https://content.dropboxapi.com/2/files/download";
    const apiArg = { path: `/${SYNC_FILENAME}` };

    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.setRequestHeader("Dropbox-API-Arg", JSON.stringify(apiArg));
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              try {
                resolve(JSON.parse(xhr.responseText) as SyncPayload);
              } catch {
                resolve(null);
              }
            } else {
              // 404 or error — no sync file exists yet
              resolve(null);
            }
          }
        };
        xhr.send();
      } catch {
        resolve(null);
      }
    });
  }
}

export class Drive implements BackupProvider {
  private async getToken() {
    await UserSettings.updateItems();
    if (
      !UserSettings.items.driveToken ||
      (await new Promise(
        (
          resolve: (value: boolean) => void,
          reject: (reason: Error) => void
        ) => {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", "https://www.googleapis.com/drive/v3/files");
          xhr.setRequestHeader(
            "Authorization",
            "Bearer " + UserSettings.items.driveToken
          );
          xhr.onreadystatechange = async () => {
            if (xhr.readyState === 4) {
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.error) {
                  if (res.error.code === 401) {
                    if (
                      navigator.userAgent.indexOf("Chrome") !== -1 &&
                      navigator.userAgent.indexOf("OPR") === -1 &&
                      navigator.userAgent.indexOf("Edg") === -1
                    ) {
                      // Clear invalid token from
                      // chrome://identity-internals/
                      await chrome.identity.removeCachedAuthToken({
                        token: UserSettings.items.driveToken as string,
                      });
                    }
                    UserSettings.items.driveToken = undefined;
                    UserSettings.commitItems();
                    resolve(true);
                  }
                } else {
                  resolve(false);
                }
              } catch (error) {
                console.error(error);
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send();
        }
      ))
    ) {
      await this.refreshToken();
    }
    return UserSettings.items.driveToken;
  }

  private async refreshToken() {
    await UserSettings.updateItems();

    if (
      navigator.userAgent.indexOf("Chrome") !== -1 &&
      navigator.userAgent.indexOf("OPR") === -1 &&
      navigator.userAgent.indexOf("Edg") === -1
    ) {
      return new Promise((resolve: (value: boolean) => void) => {
        return chrome.identity.getAuthToken(
          {
            interactive: false,
            scopes: ["https://www.googleapis.com/auth/drive.file"],
          },
          (token) => {
            UserSettings.items.driveToken = token;
            if (!token) {
              UserSettings.items.driveRevoked = true;
            }
            UserSettings.commitItems();
            resolve(Boolean(token));
          }
        );
      });
    } else {
      return new Promise(
        (
          resolve: (value: boolean) => void,
          reject: (reason: Error) => void
        ) => {
          const xhr = new XMLHttpRequest();
          xhr.open(
            "POST",
            "https://www.googleapis.com/oauth2/v4/token?client_id=" +
              getCredentials().drive.client_id +
              "&client_secret=" +
              getCredentials().drive.client_secret +
              "&refresh_token=" +
              UserSettings.items.driveRefreshToken +
              "&grant_type=refresh_token"
          );
          xhr.setRequestHeader("Accept", "application/json");
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 401) {
                UserSettings.items.driveRefreshToken = undefined;
                UserSettings.items.driveRevoked = true;
                UserSettings.commitItems();
                return resolve(false);
              }
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.error) {
                  if (res.error === "invalid_grant") {
                    UserSettings.items.driveRefreshToken = undefined;
                    UserSettings.items.driveRevoked = true;
                    UserSettings.commitItems();
                  }
                  console.error(res.error_description);
                  resolve(false);
                } else {
                  UserSettings.items.driveToken = res.access_token;
                  UserSettings.commitItems();
                  resolve(true);
                }
              } catch (error) {
                console.error(error);
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send();
        }
      );
    }
  }

  private async getFolder() {
    const token = await this.getToken();
    if (!token) {
      return false;
    }
    await UserSettings.updateItems();
    if (UserSettings.items.driveFolder) {
      await new Promise(
        (
          resolve: (value: boolean) => void,
          reject: (reason: Error) => void
        ) => {
          const xhr = new XMLHttpRequest();
          xhr.open(
            "GET",
            "https://www.googleapis.com/drive/v3/files/" +
              UserSettings.items.driveFolder +
              "?fields=trashed"
          );
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.setRequestHeader("Accept", "application/json");
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 401) {
                UserSettings.items.driveToken = undefined;
                UserSettings.commitItems();
                return resolve(false);
              }
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.error) {
                  if (res.error.code === 404) {
                    UserSettings.items.driveFolder = undefined;
                    UserSettings.commitItems();
                    resolve(true);
                  } else {
                    console.error(res.error.message);
                    resolve(false);
                  }
                } else if (res.trashed) {
                  UserSettings.items.driveFolder = undefined;
                  UserSettings.commitItems();
                  resolve(true);
                } else {
                  resolve(true);
                }
              } catch (error) {
                console.error(error);
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send();
        }
      );
    }
    if (!UserSettings.items.driveFolder) {
      await new Promise(
        (
          resolve: (value: boolean) => void,
          reject: (reason: Error) => void
        ) => {
          // create folder
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "https://www.googleapis.com/drive/v3/files/");
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.setRequestHeader("Accept", "application/json");
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 401) {
                UserSettings.items.driveToken = undefined;
                UserSettings.commitItems();
                return resolve(false);
              }
              try {
                const res = JSON.parse(xhr.responseText);
                if (!res.error) {
                  UserSettings.items.driveFolder = res.id;
                  UserSettings.commitItems();
                  resolve(true);
                } else {
                  console.error(res.error.message);
                  resolve(false);
                }
              } catch (error) {
                console.error(error);
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send(
            JSON.stringify({
              name: "GenZ-Authenticator Backups",
              mimeType: "application/vnd.google-apps.folder",
            })
          );
        }
      );
    }
    return UserSettings.items.driveFolder;
  }

  async upload(encryption: Encryption) {
    await UserSettings.updateItems();
    if (UserSettings.items.driveEncrypted === undefined) {
      UserSettings.items.driveEncrypted = true;
      UserSettings.commitItems();
    }
    const exportData = await EntryStorage.backupGetExport(
      encryption,
      UserSettings.items.driveEncrypted === true
    );
    const backup = JSON.stringify(exportData, null, 2);

    const token = await this.getToken();
    if (!token) {
      return false;
    }
    const folderId = await this.getFolder();
    return new Promise(
      (resolve: (value: boolean) => void, reject: (reason: Error) => void) => {
        if (!token || !folderId) {
          return resolve(false);
        }
        try {
          const xhr = new XMLHttpRequest();
          const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          xhr.open(
            "POST",
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
          );
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.setRequestHeader(
            "Content-type",
            "multipart/related; boundary=segment_marker"
          );
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 401) {
                UserSettings.items.driveToken = undefined;
                UserSettings.commitItems();
                return resolve(false);
              }
              try {
                const res = JSON.parse(xhr.responseText);
                if (!res.error) {
                  resolve(true);
                } else {
                  console.error(res.error.message);
                  resolve(false);
                }
              } catch (error) {
                reject(error as Error);
              }
            }
            return;
          };
          const requestDataPrototype = [
            "--segment_marker",
            "Content-Type: application/json; charset=UTF-8",
            "",
            JSON.stringify({
              name: `${now}.json`,
              parents: [UserSettings.items.driveFolder],
            }),
            "",
            "--segment_marker",
            "Content-Type: application/octet-stream",
            "",
            backup,
            "--segment_marker--",
          ];
          let requestData = "";
          requestDataPrototype.forEach((line) => {
            requestData = requestData + line + "\n";
          });
          xhr.send(requestData);
        } catch (error) {
          return reject(error as Error);
        }
      }
    );
  }

  async getUser() {
    const token = await this.getToken();
    if (!token) {
      return "Error: Access revoked or expired.";
    }

    await UserSettings.updateItems();
    return new Promise((resolve: (value: string) => void) => {
      if (!token) {
        resolve("Error: Access revoked or expired.");
      }
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "https://www.googleapis.com/drive/v2/about?fields=user");
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 401) {
            UserSettings.items.driveToken = undefined;
            UserSettings.commitItems();
            resolve(
              "Error: Response was 401. You will be logged out the next time you open GenZ-Authenticator."
            );
          }
          try {
            const res = JSON.parse(xhr.responseText);
            if (!res.error) {
              resolve(res.user.emailAddress);
            } else {
              console.error(res.error.message);
              resolve("Error");
            }
          } catch (e) {
            console.error(e);
            resolve("Error");
          }
        }
        return;
      };
      xhr.send();
    });
  }

  /**
   * Find or create the sync file in the GenZ-Authenticator Backups folder.
   * Returns the file ID if found, or null.
   */
  private async findSyncFile(): Promise<string | null> {
    const token = await this.getToken();
    if (!token) return null;

    const folderId = await this.getFolder();
    if (!folderId) return null;

    const query = encodeURIComponent(
      `name='${SYNC_FILENAME}' and '${folderId}' in parents and trashed=false`
    );

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "GET",
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`
      );
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.setRequestHeader("Accept", "application/json");
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          try {
            const res = JSON.parse(xhr.responseText);
            if (res.files && res.files.length > 0) {
              resolve(res.files[0].id);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        }
      };
      xhr.send();
    });
  }

  async uploadSync(payload: SyncPayload): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;

    const body = JSON.stringify(payload);
    const existingFileId = await this.findSyncFile();

    if (existingFileId) {
      // Update existing file
      return new Promise((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open(
            "PATCH",
            `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`
          );
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.setRequestHeader("Content-type", "application/octet-stream");
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 401) {
                UserSettings.items.driveToken = undefined;
                UserSettings.commitItems();
                return resolve(false);
              }
              try {
                const res = JSON.parse(xhr.responseText);
                resolve(!res.error);
              } catch (error) {
                reject(error as Error);
              }
            }
          };
          xhr.send(body);
        } catch (error) {
          reject(error as Error);
        }
      });
    }

    // Create new file in the backup folder
    const folderId = await this.getFolder();
    if (!folderId) return false;

    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
        );
        xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.setRequestHeader(
          "Content-type",
          "multipart/related; boundary=segment_marker"
        );
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 401) {
              UserSettings.items.driveToken = undefined;
              UserSettings.commitItems();
              return resolve(false);
            }
            try {
              const res = JSON.parse(xhr.responseText);
              resolve(!res.error);
            } catch (error) {
              reject(error as Error);
            }
          }
        };
        const parts = [
          "--segment_marker",
          "Content-Type: application/json; charset=UTF-8",
          "",
          JSON.stringify({ name: SYNC_FILENAME, parents: [folderId] }),
          "",
          "--segment_marker",
          "Content-Type: application/octet-stream",
          "",
          body,
          "--segment_marker--",
        ];
        xhr.send(parts.join("\n"));
      } catch (error) {
        reject(error as Error);
      }
    });
  }

  async downloadSync(): Promise<SyncPayload | null> {
    const token = await this.getToken();
    if (!token) return null;

    const fileId = await this.findSyncFile();
    if (!fileId) return null;

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "GET",
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      );
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            try {
              resolve(JSON.parse(xhr.responseText) as SyncPayload);
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        }
      };
      xhr.send();
    });
  }
}

export class OneDrive implements BackupProvider {
  private async getToken() {
    await UserSettings.updateItems();
    if (
      !UserSettings.items.oneDriveToken ||
      (await new Promise(
        (
          resolve: (value: boolean) => void,
          reject: (reason: Error) => void
        ) => {
          const xhr = new XMLHttpRequest();
          xhr.open(
            "GET",
            "https://graph.microsoft.com/v1.0/me/drive/special/approot"
          );
          xhr.setRequestHeader(
            "Authorization",
            "Bearer " + UserSettings.items.oneDriveToken
          );
          xhr.onreadystatechange = async () => {
            if (xhr.readyState === 4) {
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.error) {
                  if (res.error.code === 401) {
                    UserSettings.items.oneDriveToken = undefined;
                    UserSettings.commitItems();
                    resolve(true);
                  }
                } else {
                  resolve(false);
                }
              } catch (error) {
                console.error(error);
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send();
        }
      ))
    ) {
      await this.refreshToken();
    }
    return UserSettings.items.oneDriveToken;
  }

  private async refreshToken() {
    await UserSettings.updateItems();
    return new Promise(
      (resolve: (value: boolean) => void, reject: (reason: Error) => void) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        );
        xhr.setRequestHeader(
          "Content-Type",
          "application/x-www-form-urlencoded"
        );
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 401) {
              UserSettings.items.oneDriveRefreshToken = undefined;
              UserSettings.items.oneDriveRevoked = true;
              UserSettings.commitItems();
              return resolve(false);
            }
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.error) {
                if (res.error === "invalid_grant") {
                  UserSettings.items.oneDriveRefreshToken = undefined;
                  UserSettings.items.oneDriveRevoked = true;
                  UserSettings.commitItems();
                }
                console.error(res.error_description);
                resolve(false);
              } else {
                UserSettings.items.oneDriveToken = res.access_token;
                UserSettings.commitItems();
                resolve(true);
              }
            } catch (error) {
              console.error(error);
              reject(error as Error);
            }
          }
          return;
        };
        xhr.send(
          `client_id=${getCredentials().onedrive.client_id}&refresh_token=${
            UserSettings.items.oneDriveRefreshToken
          }&client_secret=${encodeURIComponent(
            getCredentials().onedrive.client_secret
          )}&grant_type=refresh_token&scope=https%3A%2F%2Fgraph.microsoft.com%2FFiles.ReadWrite${
            UserSettings.items.oneDriveBusiness !== true ? ".AppFolder" : ""
          }%20https%3A%2F%2Fgraph.microsoft.com%2FUser.Read%20offline_access`
        );
      }
    );
  }

  async upload(encryption: Encryption) {
    await UserSettings.updateItems();
    if (UserSettings.items.oneDriveEncrypted === undefined) {
      UserSettings.items.oneDriveEncrypted = true;
    }
    const exportData = await EntryStorage.backupGetExport(
      encryption,
      UserSettings.items.oneDriveEncrypted === true
    );
    const backup = JSON.stringify(exportData, null, 2);

    const token = await this.getToken();
    if (!token) {
      return false;
    }

    return new Promise(
      (resolve: (value: boolean) => void, reject: (reason: Error) => void) => {
        if (!token) {
          return resolve(false);
        }
        try {
          const xhr = new XMLHttpRequest();
          const now = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          xhr.open(
            "PUT",
            `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${now}.json:/content`
          );
          xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.setRequestHeader("Content-type", "application/octet-stream");
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 401) {
                UserSettings.removeItem("oneDriveToken");
                return resolve(false);
              }
              try {
                const res = JSON.parse(xhr.responseText);
                if (!res.error) {
                  resolve(true);
                } else {
                  console.error(res.error.message);
                  resolve(false);
                }
              } catch (error) {
                reject(error as Error);
              }
            }
            return;
          };
          xhr.send(backup);
        } catch (error) {
          return reject(error as Error);
        }
      }
    );
  }

  async getUser() {
    const token = await this.getToken();
    if (!token) {
      return "Error: Access revoked or expired.";
    }

    await UserSettings.updateItems();

    return new Promise((resolve: (value: string) => void) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "https://graph.microsoft.com/v1.0/me/");
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 401) {
            UserSettings.items.oneDriveToken = undefined;
            UserSettings.commitItems();
            resolve(
              "Error: Response was 401. You will be logged out the next time you open GenZ-Authenticator."
            );
          }
          try {
            const res = JSON.parse(xhr.responseText);
            if (!res.error) {
              resolve(res.userPrincipalName);
            } else {
              console.error(res.error.message);
              resolve("Error");
            }
          } catch (e) {
            console.error(e);
            resolve("Error");
          }
        }
        return;
      };
      xhr.send();
    });
  }

  async uploadSync(payload: SyncPayload): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;

    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "PUT",
          `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILENAME}:/content`
        );
        xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.setRequestHeader("Content-type", "application/octet-stream");
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 401) {
              UserSettings.removeItem("oneDriveToken");
              return resolve(false);
            }
            try {
              const res = JSON.parse(xhr.responseText);
              resolve(!res.error);
            } catch (error) {
              reject(error as Error);
            }
          }
        };
        xhr.send(JSON.stringify(payload));
      } catch (error) {
        reject(error as Error);
      }
    });
  }

  async downloadSync(): Promise<SyncPayload | null> {
    const token = await this.getToken();
    if (!token) return null;

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "GET",
        `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILENAME}:/content`
      );
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            try {
              resolve(JSON.parse(xhr.responseText) as SyncPayload);
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        }
      };
      xhr.send();
    });
  }
}
