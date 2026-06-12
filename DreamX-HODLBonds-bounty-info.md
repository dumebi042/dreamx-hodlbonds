# DreamX HODLBonds Web\&dApp DualDefense Audit

## Program info 

HODLBonds is a DeFi protocol where users deposit token pairs into vaults, and the protocol's trader swaps between them.

## IN SCOPE

| Target | Type | Severity | Reward |
| :---- | :---- | :---- | :---- |
| [https://github.com/hackenproof-public/dreamx-hodlbonds-blockchain-executor](https://github.com/hackenproof-public/dreamx-hodlbonds-blockchain-executor)  Brunch: Main Participation: Invite-only \- [Request Access to Repository](https://hackenproof.com/redirect?url=https%3A%2F%2Fdiscord.com%2Fchannels%2F918595597769015397%2F1485699362012004352) KYC Required | Code | Critical |  |
| [https://github.com/hackenproof-public/dreamx-hodlbonds-api](https://github.com/hackenproof-public/dreamx-hodlbonds-api)  Brunch: Main Participation: Invite-only \- [Request Access to Repository](https://hackenproof.com/redirect?url=https%3A%2F%2Fdiscord.com%2Fchannels%2F918595597769015397%2F1485699362012004352) KYC Required | Code | Critical |  |

## Focus Area

### IN-SCOPE: WEB VULNERABILITIES

Any vulnerability or chain of vulnerabilities that leads directly to unauthorized fund transfers, transaction tampering, and financial fraud leading to significant loss of user or platform funds.

Any vulnerability or chain of vulnerabilities that leads directly to exposure of essential cryptographic secrets or unauthorized access to hot or cold wallets leading to asset loss.

Any instance of Remote Code Execution (RCE) on in-scope Domains that allows arbitrary command execution, system compromise, and full application takeover.

The list of acceptable vulnerabilities:

* **Funds Transfer Race Conditions:** Vulnerabilities where race conditions can be exploited to manipulate or duplicate funds transfers.  
* **Injection Vulnerabilities:** Issues such as SQL Injection (SQLi), NoSQL Injection (NoSQLi), XML External Entity (XXE) Injection, and Server-Side Template Injection (SSTI) may allow unauthorized access to critical data or lead to remote code execution.  
* **Stored Cross-Site Scripting (XSS):** Vulnerabilities where malicious scripts are stored and later executed — particularly those that have been proven to enable impactful exploits such as session hijacking or unauthorized actions like admin account creation.  
* **File Inclusion Vulnerabilities:** Local File Inclusion (LFI) and Remote File Inclusion (RFI) that could allow unauthorized file access or the execution of arbitrary code.  
* **Access Control Vulnerabilities:**  
  * **Vertical Insecure Direct Object References (IDOR) and Privilege Escalation:** Vulnerabilities that allow attackers to gain elevated privileges, such as accessing admin-level functionality or sensitive resources meant for higher roles.  
  * **Broken Authorization:** Flaws that permit unauthorized users to perform actions or access data reserved for higher-privileged accounts, such as administrators or system-level users.  
* **Sensitive Information Disclosure:** Unauthorized exposure of sensitive data, including personal information, credentials, or internal configurations that could lead to account or system takeover.  
* **Server-Side Request Forgery (SSRF):** Vulnerabilities that allow an attacker to make the server issue unintended requests, particularly when this can be chained with other flaws to gain remote code execution (RCE) or access critical internal resources or sensitive data — beyond basic internal network access.  
* **Directory Traversal (Path Traversal):** Vulnerabilities that allow attackers to access files outside the intended directory, only when the accessed files provide a path to meaningful impact — such as enabling remote code execution (RCE) or exposing configurations or credentials that can be leveraged for privilege escalation, lateral movement, or access to critical systems or data.  
* **Command Injection:** Flaws that enable the execution of arbitrary system commands on the server.  
* **Unrestricted File Upload:** Vulnerabilities permitting the upload of files without proper validation, which can lead to remote code execution.  
* **Exposure of Cryptographic Keys:** Leaking private keys or other cryptographic secrets in front-end files or server responses, only when such exposure can be used to perform account takeover, impersonate users, or gain unauthorized access to critical systems or data — not just passive access to the keys themselves.  
* **DNS Poisoning Attacks:** Vulnerabilities that can allow attackers to completely hijack the domain resolution process for targeted websites.

### OUT OF SCOPE: WEB VULNERABILITIES

* All other issues not mentioned “IN SCOPE” area

## Program Rules

**Only critical vulnerabilities that could lead to the loss of user funds or the permanent lock of funds are eligible for rewards.**

* The company is not obliged to pay for "Low"-"High" severity issues. Only "Critical" issues are under the scope. However, the team may, at its discretion, accept the report and pay the bonus, the reward will not be a part of the bounty pool.  
* Perform testing only within the scope  
* Any details of found vulnerabilities must not be communicated to anyone who is not a HackenProof Team or an authorized employee of this Company without appropriate permission  
* Each vulnerability must have a fully working Proof of Concept (PoC) attached to the report at the time of submission. Submissions missing a valid POC will be closed and may result in a reputation point penalty.  
* Each vulnerability must have a significant, implicit high likelihood of exploitation.  
* Each vulnerability must include a suggested fix or mitigation strategy at the time of submission of the report  
* Human-based errors and rogue privileged users are considered to be not valid vulnerabilities or risks.

#### Fail to comply with these rules may result in the closure of your report, loss of reputation points, and ban from future participation in the contest

**A critical vulnerability is defined as a vulnerability with both high likelihood and high impact.**

## Reward Distribution:

* The reward will be distributed in HAI tokens. For that you will need to provide in your account your hAI wallet address so we can arrange the transaction.

**Clear wording:**

* Bounty pool — total amount of reward in the DualDefence Audit.  
* Allocated bounty — amount of reward for each unique vulnerability reported.  
* The total bounty pool for the DualDefence Audit will be equally split among all unique issues reported.  
* *Example*: If three researchers identify the same vulnerability and also there are two other vulnerabilities submitted only once (total 3 unique issues reported) each vulnerability will get 1/3 of the bounty pool.  
  Allocated bounty reward will be split between all researchers who submitted the same issue (where unique issues receive 1/3 of the pool and researchers will get 1/9 each of the initial reward pool).

Allocated bounty reward will be split between all researchers who submitted the same issue (where unique issues receive 1/3 of the pool and researchers will get 1/9 each of the initial reward pool).

#### Single Valid Submission

Full Reward: If a critical vulnerability is found by only one participant, that reporter receives 100% of the bounty pool.

#### Duplicate Submissions

If multiple participants find the same vulnerability, the allocated bounty for that issue (bounty pool always equally split among all unique issues reported) is divided equally among all reporters.  
*Example*: If two researchers report the same vulnerability, each receives 50% of the allocated bounty. It can be 50% of the bounty pool if only one eligible issue was reported.

#### Multiple Unique Submissions

Split Based on Uniqueness of issues reported:

* Unique Issue 1: Found by one reporter.  
* Unique Issue 2: Found by another reporter.

Each will receive 50% of the bounty pool.

For any questions regarding the program, feel free to reach out in our [DualDefense Support Request](https://hackenproof.com/redirect?url=https%3A%2F%2Fdiscord.com%2Fchannels%2F918595597769015397%2F1358942125609455727).

**\[DISCLAIMER\] The reward amount will be denominated in HAI tokens which are staked in FlashPool, due to market volatility, the final USD amount may differ from the one stated in the rules.**

**HackenProof is entitled to 10% of rewards as the fee for the triage and other services‼️**

## Disclosure Guidelines

Do not discuss this program or any vulnerabilities (even resolved ones) outside of the program without express consent from the organization

* No vulnerability disclosure, including partial is allowed till the end of FlashBounty Audit contest.  
* Please do NOT publish/discuss bugs

### Eligibility and Coordinated Disclosure

We are happy to thank everyone who submits valid reports which help us improve our security. However, only those that meet the following eligibility requirements may receive a monetary reward:

* The vulnerability must be a qualifying vulnerability  
* Any vulnerability found must be reported exclusively through [hackenproof.com](https://hackenproof.com/redirect?url=http%3A%2F%2Fhackenproof.com)  
* You must send a clear textual description of the report along with steps to reproduce the issue, include attachments such as screenshots or proof of concept code as necessary.  
* You must not be a former or current employee of us or one of its contractor.  
* Provide detailed but to-the point reproduction steps  
* AI-generated reports without runnable PoC are not accepted under this program.

Last Audit  
[Hacken](https://hacken.io/audits/dreamx/dapp-dreamx-hodlbonds-mar2026/) \- March 2026

Assets in Scope

* apps  
* trading-api (single app only) \- apps › trading-api (single app only)  
* hodlbonds-blockchain-executor \- hodlbonds-blockchain-executor  
* 

