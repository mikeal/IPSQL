
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
    	let h3;
    	let t3;
    	let p0;
    	let t5;
    	let p1;
    	let t7;
    	let p2;
    	let t8;
    	let a0;
    	let strong0;
    	let t10;
    	let a1;
    	let strong1;
    	let t12;
    	let t13;
    	let p3;
    	let t14;
    	let a2;
    	let t16;
    	let a3;
    	let t18;
    	let a4;
    	let t20;
    	let a5;
    	let t22;
    	let a6;
    	let t24;
    	let a7;
    	let t26;
    	let strong2;
    	let t28;
    	let t29;
    	let p4;
    	let t30;
    	let a8;
    	let t32;
    	let t33;
    	let p5;
    	let t35;
    	let p6;
    	let t36;
    	let strong3;
    	let t38;
    	let a9;
    	let strong4;
    	let t40;
    	let strong5;
    	let t42;
    	let strong6;
    	let t44;
    	let t45;
    	let p7;
    	let t46;
    	let strong7;
    	let t48;
    	let ul;
    	let li0;
    	let t49;
    	let strong8;
    	let t51;
    	let t52;
    	let li1;
    	let t53;
    	let a10;
    	let t55;
    	let strong9;
    	let t57;
    	let t58;
    	let li2;
    	let t59;
    	let strong10;
    	let t61;
    	let t62;
    	let li3;
    	let t63;
    	let strong11;
    	let t65;
    	let t66;
    	let p8;
    	let t68;
    	let p9;
    	let t69;
    	let strong12;
    	let t71;

    	const block = {
    		c: function create() {
    			how = element("how");
    			h1 = element("h1");
    			h1.textContent = "How does IPSQL work?";
    			t1 = space();
    			h3 = element("h3");
    			h3.textContent = "Proof of SQL";
    			t3 = space();
    			p0 = element("p");
    			p0.textContent = "IPSQL is quite different from traditional databases.";
    			t5 = space();
    			p1 = element("p");
    			p1.textContent = "A typical database will write to a file on a server you're running it on. But\n  that doesn't work so well for building distributed systems.";
    			t7 = space();
    			p2 = element("p");
    			t8 = text("IPSQL produces ");
    			a0 = element("a");
    			strong0 = element("strong");
    			strong0.textContent = "blocks";
    			t10 = text(", which are just blobs of binary data\n  that are then referenced by ");
    			a1 = element("a");
    			strong1 = element("strong");
    			strong1.textContent = "hash address";
    			t12 = text(".");
    			t13 = space();
    			p3 = element("p");
    			t14 = text("This means that you can store IPSQL data anywhere. File systems, ");
    			a2 = element("a");
    			a2.textContent = "S3";
    			t16 = text(", ");
    			a3 = element("a");
    			a3.textContent = "export files";
    			t18 = text(", ");
    			a4 = element("a");
    			a4.textContent = "CDN";
    			t20 = text(", ");
    			a5 = element("a");
    			a5.textContent = "browser local storage";
    			t22 = text(",\n  p2p networks (");
    			a6 = element("a");
    			a6.textContent = "IPFS";
    			t24 = text("), blockchains (");
    			a7 = element("a");
    			a7.textContent = "Filecoin";
    			t26 = text("), can all be used to store and provide access to IPSQL databases. In fact, you can use any ");
    			strong2 = element("strong");
    			strong2.textContent = "combination";
    			t28 = text(" of these storage systems layered as you see fit.");
    			t29 = space();
    			p4 = element("p");
    			t30 = text("Since data is addressed by a ");
    			a8 = element("a");
    			a8.textContent = "cryptographic hash";
    			t32 = text(" we don't even need to trust the data provider since\n  we can verify any data sent matches the hash in the address.");
    			t33 = space();
    			p5 = element("p");
    			p5.textContent = "Traditional SQL databases write \"pages\" to file formats on disc for each transaction. This gives you a guarantee when the transaction returns the data is safely on disc. These pages accumulate as you add\n  more data and indexes to your database.";
    			t35 = space();
    			p6 = element("p");
    			t36 = text("IPSQL is a functional transformation that takes the hash address of a ");
    			strong3 = element("strong");
    			strong3.textContent = "database";
    			t38 = text(" and a ");
    			a9 = element("a");
    			strong4 = element("strong");
    			strong4.textContent = "SQL statement";
    			t40 = text(" as input and deterministically returns the ");
    			strong5 = element("strong");
    			strong5.textContent = "hash address";
    			t42 = text(" of a ");
    			strong6 = element("strong");
    			strong6.textContent = "SQL proof";
    			t44 = text(".");
    			t45 = space();
    			p7 = element("p");
    			t46 = text("A ");
    			strong7 = element("strong");
    			strong7.textContent = "SQL proof";
    			t48 = text(" describes\n  ");
    			ul = element("ul");
    			li0 = element("li");
    			t49 = text("the ");
    			strong8 = element("strong");
    			strong8.textContent = "result";
    			t51 = text(" of the SQL statement (if there is one, there won't be for most writes),");
    			t52 = space();
    			li1 = element("li");
    			t53 = text("a ");
    			a10 = element("a");
    			a10.textContent = "Set";
    			t55 = text(" of hash addresses that must be ");
    			strong9 = element("strong");
    			strong9.textContent = "read";
    			t57 = text(" to perform the statement,");
    			t58 = space();
    			li2 = element("li");
    			t59 = text("a Set of ");
    			strong10 = element("strong");
    			strong10.textContent = "new";
    			t61 = text(" hash addresses written by the statement,");
    			t62 = space();
    			li3 = element("li");
    			t63 = text("and the hash address of the database ");
    			strong11 = element("strong");
    			strong11.textContent = "after";
    			t65 = text(" executing the statement.");
    			t66 = space();
    			p8 = element("p");
    			p8.textContent = "Rather than just returning the desired query result, we also know the block addresses required to verify\n  the proof. This means we can have untrusted parties hold the large amounts of data necessary to perform\n  arbitrary SQL queries. We then only need this small fraction of the database to verify the proof.";
    			t68 = space();
    			p9 = element("p");
    			t69 = text("We can also query databases and store their results in cache and offline.\n  When the database changes in the future we can ask for a new proof of the same query. If the hash of the\n  read set has not changed then our query has not changed. If it has changed, or if we want to verify the proof,\n  we can ask for the ");
    			strong12 = element("strong");
    			strong12.textContent = "delta";
    			t71 = text(" of blocks between the old proof and the new one.");
    			attr_dev(h1, "class", "svelte-paczwg");
    			add_location(h1, file, 17, 2, 183);
    			attr_dev(h3, "class", "svelte-paczwg");
    			add_location(h3, file, 18, 2, 215);
    			attr_dev(p0, "class", "svelte-paczwg");
    			add_location(p0, file, 19, 2, 239);
    			attr_dev(p1, "class", "svelte-paczwg");
    			add_location(p1, file, 20, 2, 301);
    			attr_dev(strong0, "class", "svelte-paczwg");
    			add_location(strong0, file, 22, 75, 523);
    			attr_dev(a0, "href", "https://specs.ipld.io/block-layer/block.html");
    			attr_dev(a0, "class", "svelte-paczwg");
    			add_location(a0, file, 22, 20, 468);
    			attr_dev(strong1, "class", "svelte-paczwg");
    			add_location(strong1, file, 23, 83, 671);
    			attr_dev(a1, "href", "https://specs.ipld.io/block-layer/CID.html");
    			attr_dev(a1, "class", "svelte-paczwg");
    			add_location(a1, file, 23, 30, 618);
    			attr_dev(p2, "class", "svelte-paczwg");
    			add_location(p2, file, 22, 2, 450);
    			attr_dev(a2, "href", "https://aws.amazon.com");
    			attr_dev(a2, "class", "svelte-paczwg");
    			add_location(a2, file, 24, 70, 780);
    			attr_dev(a3, "href", "https://specs.ipld.io/block-layer/content-addressable-archives.html");
    			attr_dev(a3, "class", "svelte-paczwg");
    			add_location(a3, file, 24, 111, 821);
    			attr_dev(a4, "href", "https://en.wikipedia.org/wiki/Content_delivery_network");
    			attr_dev(a4, "class", "svelte-paczwg");
    			add_location(a4, file, 24, 207, 917);
    			attr_dev(a5, "href", "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API");
    			attr_dev(a5, "class", "svelte-paczwg");
    			add_location(a5, file, 24, 281, 991);
    			attr_dev(a6, "href", "https://ipfs.io");
    			attr_dev(a6, "class", "svelte-paczwg");
    			add_location(a6, file, 25, 16, 1107);
    			attr_dev(a7, "href", "https://filecoin.io");
    			attr_dev(a7, "class", "svelte-paczwg");
    			add_location(a7, file, 25, 66, 1157);
    			attr_dev(strong2, "class", "svelte-paczwg");
    			add_location(strong2, file, 25, 200, 1291);
    			attr_dev(p3, "class", "svelte-paczwg");
    			add_location(p3, file, 24, 2, 712);
    			attr_dev(a8, "href", "https://en.wikipedia.org/wiki/Cryptographic_hash_function");
    			attr_dev(a8, "class", "svelte-paczwg");
    			add_location(a8, file, 26, 34, 1407);
    			attr_dev(p4, "class", "svelte-paczwg");
    			add_location(p4, file, 26, 2, 1375);
    			attr_dev(p5, "class", "svelte-paczwg");
    			add_location(p5, file, 28, 2, 1619);
    			attr_dev(strong3, "class", "svelte-paczwg");
    			add_location(strong3, file, 30, 75, 1947);
    			attr_dev(strong4, "class", "svelte-paczwg");
    			add_location(strong4, file, 30, 161, 2033);
    			attr_dev(a9, "href", "https://www.w3schools.com/sql/sql_intro.asp");
    			attr_dev(a9, "class", "svelte-paczwg");
    			add_location(a9, file, 30, 107, 1979);
    			attr_dev(strong5, "class", "svelte-paczwg");
    			add_location(strong5, file, 30, 239, 2111);
    			attr_dev(strong6, "class", "svelte-paczwg");
    			add_location(strong6, file, 30, 274, 2146);
    			attr_dev(p6, "class", "svelte-paczwg");
    			add_location(p6, file, 30, 2, 1874);
    			attr_dev(strong7, "class", "svelte-paczwg");
    			add_location(strong7, file, 31, 7, 2185);
    			attr_dev(p7, "class", "svelte-paczwg");
    			add_location(p7, file, 31, 2, 2180);
    			attr_dev(strong8, "class", "svelte-paczwg");
    			add_location(strong8, file, 33, 12, 2241);
    			attr_dev(li0, "class", "svelte-paczwg");
    			add_location(li0, file, 33, 4, 2233);
    			attr_dev(a10, "href", "https://en.wikipedia.org/wiki/Set_(abstract_data_type)");
    			attr_dev(a10, "class", "svelte-paczwg");
    			add_location(a10, file, 34, 10, 2352);
    			attr_dev(strong9, "class", "svelte-paczwg");
    			add_location(strong9, file, 34, 114, 2456);
    			attr_dev(li1, "class", "svelte-paczwg");
    			add_location(li1, file, 34, 4, 2346);
    			attr_dev(strong10, "class", "svelte-paczwg");
    			add_location(strong10, file, 35, 17, 2526);
    			attr_dev(li2, "class", "svelte-paczwg");
    			add_location(li2, file, 35, 4, 2513);
    			attr_dev(strong11, "class", "svelte-paczwg");
    			add_location(strong11, file, 36, 45, 2638);
    			attr_dev(li3, "class", "svelte-paczwg");
    			add_location(li3, file, 36, 4, 2597);
    			attr_dev(ul, "class", "svelte-paczwg");
    			add_location(ul, file, 32, 2, 2224);
    			attr_dev(p8, "class", "svelte-paczwg");
    			add_location(p8, file, 38, 2, 2701);
    			attr_dev(strong12, "class", "svelte-paczwg");
    			add_location(strong12, file, 45, 21, 3342);
    			attr_dev(p9, "class", "svelte-paczwg");
    			add_location(p9, file, 42, 2, 3024);
    			attr_dev(how, "class", "svelte-paczwg");
    			add_location(how, file, 16, 0, 175);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, how, anchor);
    			append_dev(how, h1);
    			append_dev(how, t1);
    			append_dev(how, h3);
    			append_dev(how, t3);
    			append_dev(how, p0);
    			append_dev(how, t5);
    			append_dev(how, p1);
    			append_dev(how, t7);
    			append_dev(how, p2);
    			append_dev(p2, t8);
    			append_dev(p2, a0);
    			append_dev(a0, strong0);
    			append_dev(p2, t10);
    			append_dev(p2, a1);
    			append_dev(a1, strong1);
    			append_dev(p2, t12);
    			append_dev(how, t13);
    			append_dev(how, p3);
    			append_dev(p3, t14);
    			append_dev(p3, a2);
    			append_dev(p3, t16);
    			append_dev(p3, a3);
    			append_dev(p3, t18);
    			append_dev(p3, a4);
    			append_dev(p3, t20);
    			append_dev(p3, a5);
    			append_dev(p3, t22);
    			append_dev(p3, a6);
    			append_dev(p3, t24);
    			append_dev(p3, a7);
    			append_dev(p3, t26);
    			append_dev(p3, strong2);
    			append_dev(p3, t28);
    			append_dev(how, t29);
    			append_dev(how, p4);
    			append_dev(p4, t30);
    			append_dev(p4, a8);
    			append_dev(p4, t32);
    			append_dev(how, t33);
    			append_dev(how, p5);
    			append_dev(how, t35);
    			append_dev(how, p6);
    			append_dev(p6, t36);
    			append_dev(p6, strong3);
    			append_dev(p6, t38);
    			append_dev(p6, a9);
    			append_dev(a9, strong4);
    			append_dev(p6, t40);
    			append_dev(p6, strong5);
    			append_dev(p6, t42);
    			append_dev(p6, strong6);
    			append_dev(p6, t44);
    			append_dev(how, t45);
    			append_dev(how, p7);
    			append_dev(p7, t46);
    			append_dev(p7, strong7);
    			append_dev(p7, t48);
    			append_dev(how, ul);
    			append_dev(ul, li0);
    			append_dev(li0, t49);
    			append_dev(li0, strong8);
    			append_dev(li0, t51);
    			append_dev(ul, t52);
    			append_dev(ul, li1);
    			append_dev(li1, t53);
    			append_dev(li1, a10);
    			append_dev(li1, t55);
    			append_dev(li1, strong9);
    			append_dev(li1, t57);
    			append_dev(ul, t58);
    			append_dev(ul, li2);
    			append_dev(li2, t59);
    			append_dev(li2, strong10);
    			append_dev(li2, t61);
    			append_dev(ul, t62);
    			append_dev(ul, li3);
    			append_dev(li3, t63);
    			append_dev(li3, strong11);
    			append_dev(li3, t65);
    			append_dev(how, t66);
    			append_dev(how, p8);
    			append_dev(how, t68);
    			append_dev(how, p9);
    			append_dev(p9, t69);
    			append_dev(p9, strong12);
    			append_dev(p9, t71);
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
