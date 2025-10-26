export namespace main {
	
	export class PostInfo {
	    title: string;
	    coverImage: string;
	    coverImageBase64: string;
	
	    static createFrom(source: any = {}) {
	        return new PostInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.coverImage = source["coverImage"];
	        this.coverImageBase64 = source["coverImageBase64"];
	    }
	}
	export class ListPostsResult {
	    posts: PostInfo[];
	    totalCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ListPostsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.posts = this.convertValues(source["posts"], PostInfo);
	        this.totalCount = source["totalCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

