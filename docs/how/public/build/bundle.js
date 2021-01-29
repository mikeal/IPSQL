
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.32.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* how.svelte generated by Svelte v3.32.0 */

    const file = "how.svelte";

    function create_fragment(ctx) {
    	let how;
    	let h1;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;
    	let t6;
    	let a0;
    	let strong0;
    	let t8;
    	let a1;
    	let strong1;
    	let t10;
    	let t11;
    	let p3;
    	let t12;
    	let a2;
    	let t14;
    	let a3;
    	let t16;
    	let a4;
    	let t18;
    	let a5;
    	let t20;
    	let a6;
    	let t22;
    	let a7;
    	let t24;
    	let strong2;
    	let t26;
    	let t27;
    	let p4;
    	let t28;
    	let a8;
    	let t30;
    	let t31;
    	let p5;
    	let t33;
    	let p6;
    	let t34;
    	let strong3;
    	let t36;
    	let a9;
    	let strong4;
    	let t38;
    	let strong5;
    	let t40;
    	let strong6;
    	let t42;
    	let t43;
    	let p7;
    	let t44;
    	let strong7;
    	let t46;
    	let ul;
    	let li0;
    	let t47;
    	let strong8;
    	let t49;
    	let t50;
    	let li1;
    	let t51;
    	let a10;
    	let t53;
    	let strong9;
    	let t55;
    	let t56;
    	let li2;
    	let t57;
    	let strong10;
    	let t59;
    	let t60;
    	let li3;
    	let t62;
    	let p8;
    	let t64;
    	let p9;
    	let t65;
    	let strong11;
    	let t67;

    	const block = {
    		c: function create() {
    			how = element("how");
    			h1 = element("h1");
    			h1.textContent = "How does IPSQL work?";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "IPSQL is quite different from traditional databases.";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "A typical database will write to a file on a server you're running it on. But\n  that doesn't work so well for building distributed systems.";
    			t5 = space();
    			p2 = element("p");
    			t6 = text("IPSQL produces ");
    			a0 = element("a");
    			strong0 = element("strong");
    			strong0.textContent = "blocks";
    			t8 = text(", which are just blobs of binary data\n  that are then referenced by ");
    			a1 = element("a");
    			strong1 = element("strong");
    			strong1.textContent = "hash address";
    			t10 = text(".");
    			t11 = space();
    			p3 = element("p");
    			t12 = text("This means that you can store IPSQL data anywhere. File systems, ");
    			a2 = element("a");
    			a2.textContent = "S3";
    			t14 = text(", ");
    			a3 = element("a");
    			a3.textContent = "export files";
    			t16 = text(", ");
    			a4 = element("a");
    			a4.textContent = "CDN";
    			t18 = text(", ");
    			a5 = element("a");
    			a5.textContent = "browser local storage";
    			t20 = text(",\n  p2p networks (");
    			a6 = element("a");
    			a6.textContent = "IPFS";
    			t22 = text("), blockchains (");
    			a7 = element("a");
    			a7.textContent = "Filecoin";
    			t24 = text("), call all be used to store and provide access to IPSQL databases. In fact, you can use any ");
    			strong2 = element("strong");
    			strong2.textContent = "combination";
    			t26 = text(" of these storage systems layered as you see fit.");
    			t27 = space();
    			p4 = element("p");
    			t28 = text("Since data is addressed by a ");
    			a8 = element("a");
    			a8.textContent = "cryptrographic hash";
    			t30 = text(" we don't even need to trust the data provider since\n  we can verify any data sent matches the hash in the address.");
    			t31 = space();
    			p5 = element("p");
    			p5.textContent = "Traditional SQL databases write \"pages\" to file formats on disc for each transaction. This gives you a guarantee when the transaction returns the data is safely on disc. These pages accumulate as you add\n  more data and indexes to your database.";
    			t33 = space();
    			p6 = element("p");
    			t34 = text("IPSQL is a functional transformation that takes the hash address of a ");
    			strong3 = element("strong");
    			strong3.textContent = "database";
    			t36 = text(" and a ");
    			a9 = element("a");
    			strong4 = element("strong");
    			strong4.textContent = "SQL statement";
    			t38 = text(" as input and deterministically returns the ");
    			strong5 = element("strong");
    			strong5.textContent = "hash address";
    			t40 = text(" of a ");
    			strong6 = element("strong");
    			strong6.textContent = "SQL proof";
    			t42 = text(".");
    			t43 = space();
    			p7 = element("p");
    			t44 = text("A ");
    			strong7 = element("strong");
    			strong7.textContent = "SQL proof";
    			t46 = text(" describes\n  ");
    			ul = element("ul");
    			li0 = element("li");
    			t47 = text("the ");
    			strong8 = element("strong");
    			strong8.textContent = "result";
    			t49 = text(" of the SQL statement (if there is one, there won't be for most writes),");
    			t50 = space();
    			li1 = element("li");
    			t51 = text("a ");
    			a10 = element("a");
    			a10.textContent = "Set";
    			t53 = text(" of hash addresses that must be ");
    			strong9 = element("strong");
    			strong9.textContent = "read";
    			t55 = text(" to perform the proof,");
    			t56 = space();
    			li2 = element("li");
    			t57 = text("a Set of ");
    			strong10 = element("strong");
    			strong10.textContent = "new";
    			t59 = text(" hash addresses written by the proof,");
    			t60 = space();
    			li3 = element("li");
    			li3.textContent = "and the hash address of the database after performing the proof.";
    			t62 = space();
    			p8 = element("p");
    			p8.textContent = "Rather than just returning the desired query result, we also know the block addresses required to verify\n  the proof. This means we can have untrusted parties hold the large amounts of data necessary to perform\n  arbitrary SQL queries. We then only need this small fraction of the database to verify the proof.";
    			t64 = space();
    			p9 = element("p");
    			t65 = text("We can also query databases and store their results in cache or offline.\n  When the database changes in the future we can ask for a new proof of the same query. If the hashe of the\n  read set has not changed then our query has not changed. If it has changed, or if we want to verify the proof,\n  we can ask for the ");
    			strong11 = element("strong");
    			strong11.textContent = "delta";
    			t67 = text(" of blocks between the old proof and the new one.");
    			add_location(h1, file, 12, 2, 116);
    			add_location(p0, file, 13, 2, 148);
    			add_location(p1, file, 14, 2, 210);
    			add_location(strong0, file, 16, 75, 432);
    			attr_dev(a0, "href", "https://specs.ipld.io/block-layer/block.html");
    			add_location(a0, file, 16, 20, 377);
    			add_location(strong1, file, 17, 83, 580);
    			attr_dev(a1, "href", "https://specs.ipld.io/block-layer/CID.html");
    			add_location(a1, file, 17, 30, 527);
    			add_location(p2, file, 16, 2, 359);
    			attr_dev(a2, "href", "https://aws.amazon.com");
    			add_location(a2, file, 18, 70, 689);
    			attr_dev(a3, "href", "https://specs.ipld.io/block-layer/content-addressable-archives.html");
    			add_location(a3, file, 18, 111, 730);
    			attr_dev(a4, "href", "https://en.wikipedia.org/wiki/Content_delivery_network");
    			add_location(a4, file, 18, 207, 826);
    			attr_dev(a5, "href", "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API");
    			add_location(a5, file, 18, 281, 900);
    			attr_dev(a6, "href", "https://ipfs.io");
    			add_location(a6, file, 19, 16, 1016);
    			attr_dev(a7, "href", "https://filecoin.io");
    			add_location(a7, file, 19, 66, 1066);
    			add_location(strong2, file, 19, 201, 1201);
    			add_location(p3, file, 18, 2, 621);
    			attr_dev(a8, "href", "https://en.wikipedia.org/wiki/Cryptographic_hash_function");
    			add_location(a8, file, 20, 34, 1317);
    			add_location(p4, file, 20, 2, 1285);
    			add_location(p5, file, 22, 2, 1530);
    			add_location(strong3, file, 24, 75, 1858);
    			add_location(strong4, file, 24, 161, 1944);
    			attr_dev(a9, "href", "https://www.w3schools.com/sql/sql_intro.asp");
    			add_location(a9, file, 24, 107, 1890);
    			add_location(strong5, file, 24, 239, 2022);
    			add_location(strong6, file, 24, 274, 2057);
    			add_location(p6, file, 24, 2, 1785);
    			add_location(strong7, file, 25, 7, 2096);
    			add_location(p7, file, 25, 2, 2091);
    			add_location(strong8, file, 27, 12, 2152);
    			add_location(li0, file, 27, 4, 2144);
    			attr_dev(a10, "href", "https://en.wikipedia.org/wiki/Set_(abstract_data_type)");
    			add_location(a10, file, 28, 10, 2263);
    			add_location(strong9, file, 28, 114, 2367);
    			add_location(li1, file, 28, 4, 2257);
    			add_location(strong10, file, 29, 17, 2433);
    			add_location(li2, file, 29, 4, 2420);
    			add_location(li3, file, 30, 4, 2500);
    			add_location(ul, file, 26, 2, 2135);
    			add_location(p8, file, 32, 2, 2584);
    			add_location(strong11, file, 39, 21, 3225);
    			add_location(p9, file, 36, 2, 2907);
    			attr_dev(how, "class", "svelte-1sseda6");
    			add_location(how, file, 11, 0, 108);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, how, anchor);
    			append_dev(how, h1);
    			append_dev(how, t1);
    			append_dev(how, p0);
    			append_dev(how, t3);
    			append_dev(how, p1);
    			append_dev(how, t5);
    			append_dev(how, p2);
    			append_dev(p2, t6);
    			append_dev(p2, a0);
    			append_dev(a0, strong0);
    			append_dev(p2, t8);
    			append_dev(p2, a1);
    			append_dev(a1, strong1);
    			append_dev(p2, t10);
    			append_dev(how, t11);
    			append_dev(how, p3);
    			append_dev(p3, t12);
    			append_dev(p3, a2);
    			append_dev(p3, t14);
    			append_dev(p3, a3);
    			append_dev(p3, t16);
    			append_dev(p3, a4);
    			append_dev(p3, t18);
    			append_dev(p3, a5);
    			append_dev(p3, t20);
    			append_dev(p3, a6);
    			append_dev(p3, t22);
    			append_dev(p3, a7);
    			append_dev(p3, t24);
    			append_dev(p3, strong2);
    			append_dev(p3, t26);
    			append_dev(how, t27);
    			append_dev(how, p4);
    			append_dev(p4, t28);
    			append_dev(p4, a8);
    			append_dev(p4, t30);
    			append_dev(how, t31);
    			append_dev(how, p5);
    			append_dev(how, t33);
    			append_dev(how, p6);
    			append_dev(p6, t34);
    			append_dev(p6, strong3);
    			append_dev(p6, t36);
    			append_dev(p6, a9);
    			append_dev(a9, strong4);
    			append_dev(p6, t38);
    			append_dev(p6, strong5);
    			append_dev(p6, t40);
    			append_dev(p6, strong6);
    			append_dev(p6, t42);
    			append_dev(how, t43);
    			append_dev(how, p7);
    			append_dev(p7, t44);
    			append_dev(p7, strong7);
    			append_dev(p7, t46);
    			append_dev(how, ul);
    			append_dev(ul, li0);
    			append_dev(li0, t47);
    			append_dev(li0, strong8);
    			append_dev(li0, t49);
    			append_dev(ul, t50);
    			append_dev(ul, li1);
    			append_dev(li1, t51);
    			append_dev(li1, a10);
    			append_dev(li1, t53);
    			append_dev(li1, strong9);
    			append_dev(li1, t55);
    			append_dev(ul, t56);
    			append_dev(ul, li2);
    			append_dev(li2, t57);
    			append_dev(li2, strong10);
    			append_dev(li2, t59);
    			append_dev(ul, t60);
    			append_dev(ul, li3);
    			append_dev(how, t62);
    			append_dev(how, p8);
    			append_dev(how, t64);
    			append_dev(how, p9);
    			append_dev(p9, t65);
    			append_dev(p9, strong11);
    			append_dev(p9, t67);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(how);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("How", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<How> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class How extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "How",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new How({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
