export namespace main {
	
	export class AnnasInfo {
	    title: string;
	    subtitle: string;
	    authors: string[];
	    publisher: string;
	    publishYear: number;
	    pageCount: number;
	    language: string;
	    description: string;
	    isbn10: string;
	    isbn13: string;
	    coverUrl: string;
	    sourceUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new AnnasInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.subtitle = source["subtitle"];
	        this.authors = source["authors"];
	        this.publisher = source["publisher"];
	        this.publishYear = source["publishYear"];
	        this.pageCount = source["pageCount"];
	        this.language = source["language"];
	        this.description = source["description"];
	        this.isbn10 = source["isbn10"];
	        this.isbn13 = source["isbn13"];
	        this.coverUrl = source["coverUrl"];
	        this.sourceUrl = source["sourceUrl"];
	    }
	}
	export class AppInfo {
	    version: string;
	    build_date: string;
	    channel: string;
	
	    static createFrom(source: any = {}) {
	        return new AppInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.build_date = source["build_date"];
	        this.channel = source["channel"];
	    }
	}
	export class BootstrapDesktopReq {
	    server_url: string;
	    bootstrap_url: string;
	    invite_code: string;
	    email: string;
	    password: string;
	    admin_password: string;
	    device_name: string;
	
	    static createFrom(source: any = {}) {
	        return new BootstrapDesktopReq(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.server_url = source["server_url"];
	        this.bootstrap_url = source["bootstrap_url"];
	        this.invite_code = source["invite_code"];
	        this.email = source["email"];
	        this.password = source["password"];
	        this.admin_password = source["admin_password"];
	        this.device_name = source["device_name"];
	    }
	}
	export class LoginReq {
	    email: string;
	    password: string;
	    persist: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LoginReq(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.email = source["email"];
	        this.password = source["password"];
	        this.persist = source["persist"];
	    }
	}
	export class ReloadTrustReq {
	    bootstrap_url: string;
	    tenant_id: string;
	    admin_password: string;
	
	    static createFrom(source: any = {}) {
	        return new ReloadTrustReq(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.bootstrap_url = source["bootstrap_url"];
	        this.tenant_id = source["tenant_id"];
	        this.admin_password = source["admin_password"];
	    }
	}
	export class SessionInfo {
	    has_session: boolean;
	    has_cert: boolean;
	    server_url: string;
	    email: string;
	    user_id: string;
	    tenant_id: string;
	    device_id: string;
	
	    static createFrom(source: any = {}) {
	        return new SessionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.has_session = source["has_session"];
	        this.has_cert = source["has_cert"];
	        this.server_url = source["server_url"];
	        this.email = source["email"];
	        this.user_id = source["user_id"];
	        this.tenant_id = source["tenant_id"];
	        this.device_id = source["device_id"];
	    }
	}
	export class SetupTenantReq {
	    server_url: string;
	    bootstrap_url: string;
	    tenant_name: string;
	    admin_password: string;
	    owner_email: string;
	    owner_name: string;
	    owner_password: string;
	
	    static createFrom(source: any = {}) {
	        return new SetupTenantReq(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.server_url = source["server_url"];
	        this.bootstrap_url = source["bootstrap_url"];
	        this.tenant_name = source["tenant_name"];
	        this.admin_password = source["admin_password"];
	        this.owner_email = source["owner_email"];
	        this.owner_name = source["owner_name"];
	        this.owner_password = source["owner_password"];
	    }
	}
	export class SetupTenantResp {
	    tenant_id: string;
	    user_id: string;
	    invite_code: string;
	
	    static createFrom(source: any = {}) {
	        return new SetupTenantResp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tenant_id = source["tenant_id"];
	        this.user_id = source["user_id"];
	        this.invite_code = source["invite_code"];
	    }
	}
	export class UpdateInfo {
	    available: boolean;
	    current: string;
	    latest: string;
	    release_date: string;
	    notes_md: string;
	    size_bytes: number;
	    installer_url: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.release_date = source["release_date"];
	        this.notes_md = source["notes_md"];
	        this.size_bytes = source["size_bytes"];
	        this.installer_url = source["installer_url"];
	    }
	}

}

