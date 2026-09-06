# Rosetta Account Access

Rosetta Sales Performance uses individual dashboard accounts. It does not require ChatGPT, Google Workspace, Google OAuth, or an email provider.

## Initial administrator

Set the following secure Sites runtime values before moving the host access to public:

- `PASSWORD_ACCESS_ENABLED=true`
- `APP_SESSION_SECRET`: random 32-byte secret
- `ADMIN_EMAIL`: Sohair's chosen sign-in email
- `INITIAL_ADMIN_PASSWORD`: a strong, temporary password with at least 12 characters

The application creates the initial Administrator account automatically on the first sign-in. The Administrator should immediately change that temporary password from **Team access**.

## Managing the team

From **Team access**, an Administrator can create a unique account with a team member's email, an individual temporary password, and either role:

- `Contributor`: can add a sales record only.
- `Admin`: can access and manage the dashboard and team accounts.

Temporary passwords are shared directly by the Administrator. Automated email invitations are intentionally not used in this version.
