import { test } from 'qunit';
import { afterEach, beforeEach, hasUsableConsole, onWarn } from '../test-config';
import { initModule } from '../test-config';

export default function() {
	let Ractive_original;

	beforeEach( () => {
		// augment base Ractive object slightly
		Ractive_original = Ractive;
		Ractive = Ractive.extend({
			onconstruct ( options ) {
				// if a beforeComplete method is given as an initialisation option,
				// add it to the instance (unless it already exists on a component prototype)
				!this.beforeComplete && ( this.beforeComplete = options.beforeComplete );
			}
		});

		Ractive.transitions.test = function ( t, params ) {
			const delay = ( params && params.delay ) || 10;

			setTimeout( function () {
				if ( t.ractive.beforeComplete ) {
					t.ractive.beforeComplete( t, params );
				}

				t.complete();
			}, delay );
		};
	});

	afterEach( () => {
		Ractive = Ractive_original;
	});

	initModule( 'plugins/transitions.js' );

	test( 'Animated style', t => {
		t.expect( 2 );

		const done = t.async();

		const ractive = new Ractive({
			el: fixture,
			template: `
				{{#if show}}
					<div intro="test">content...</div>
				{{/if show}}`,
			transitions: {
				test ( transition ) {
					transition.setStyle( 'height', '100px' );

					transition.animateStyle( 'height', '200px', {
						duration: 50
					}).then( transition.complete );

					// should not have changed yet
					t.equal( transition.getStyle( 'height' ), '100px' );
				}
			}
		});

		ractive.set( 'show', true ).then( () => {
			const div = ractive.find( 'div' );
			t.equal( div.style.height, '' );
			done();
		});
	});

	test( 'Elements containing components with outroing elements do not detach until transitions are complete', t => {
		const done = t.async();

		let shouldHaveCompleted;
		let p;

		const Widget = Ractive.extend({
			template: '<p outro="test">foo</p>',
			beforeComplete () {
				shouldHaveCompleted = true;
				t.ok( fixture.contains( p ), '<p> element has already been removed from the DOM' );
			}
		});

		const ractive = new Ractive({
			el: fixture,
			template: '{{#foo}}<div><widget/></div>{{/foo}}',
			components: {
				widget: Widget
			},
			data: { foo: true }
		});

		p = ractive.find( 'p' );

		ractive.set( 'foo', false ).then( function () {
			t.ok( shouldHaveCompleted, 'promise was fulfilled before transition had completed' );
			t.ok( !fixture.contains( p ), '<p> element should have been removed from the DOM' );
			done();
		});
	});

	test( 'noIntro option prevents intro transition', t => {
		const done = t.async();

		t.expect( 1 );

		let transitioned;

		new Ractive({
			el: fixture,
			template: '<div intro="test"></div>',
			noIntro: true,
			beforeComplete(){
				transitioned = true;
			},
			oncomplete(){
				t.ok( !transitioned, 'transition happened');
				done();
			}
		});
	});

	test( 'noIntro option prevents intro transition when el is initially undefined', t => {
		t.expect( 1 );

		const done = t.async();

		let transitioned;

		const ractive = new Ractive({
			template: '<div intro="test"></div>',
			noIntro: true,
			beforeComplete () {
				transitioned = true;
			},
			oncomplete () {
				t.ok( !transitioned, 'transition happened');
				done();
			}
		});

		ractive.render( fixture );
	});

	test( 'Empty transitions on refs okay', t => {
		t.expect( 1 );

		const done = t.async();

		const ractive = new Ractive({
			el: fixture,
			debug: true,
			template: '{{#if x}}<div intro="{{foo}}"></div>{{/if}}',
			transitions: {
				test ( transition ) {
					t.ok( true );
					transition.complete();
					done();
				}
			},
			data: {
				x: true,
				foo: ''
			}
		});

		ractive.set( 'x', false );
		ractive.set( 'foo', 'test' );
		ractive.set( 'x', true );
	});

	test( 'ractive.transitionsEnabled false prevents all transitions', t => {
		t.expect( 1 );

		const done = t.async();

		let transitioned;

		const Component = Ractive.extend({
			template: '{{#foo}}<div intro-outro="test"></div>{{/foo}}',
			onconstruct ( options ) {
				this._super( options );
				this.transitionsEnabled = false;
			},
			beforeComplete () {
				transitioned = true;
			}
		});

		new Component({
			el: fixture,
			data: { foo: true },
			oncomplete () {
				this.set( 'foo', false ).then( function(){
					t.ok( !transitioned, 'outro transition happened');
					done();
				});
			}
		});
	});

	if ( hasUsableConsole ) {
		test( 'Missing transition functions do not cause errors, but do console.warn', t => {
			t.expect( 1 );

			const done = t.async();

			onWarn( msg => {
				t.ok( msg );
			});

			new Ractive({
				el: fixture,
				template: '<div intro="foo"></div>',
				oncomplete () {
					done();
				}
			});
		});
	}

	test( 'Transitions work the first time (#916)', t => {
		// we're using line height for testing because it's a numerical CSS property that IE8 supports
		const done = t.async();

		let div;

		const ractive = new Ractive({
			el: fixture,
			template: '<div intro="changeLineHeight"></div>',
			oncomplete () {
				t.equal( div.style.lineHeight, '' );
				done();
			},
			transitions: {
				changeLineHeight ( t ) {
					let targetLineHeight;

					if ( t.isIntro ) {
						targetLineHeight = t.getStyle( 'lineHeight' );
						t.setStyle( 'lineHeight', 0 );
					} else {
						targetLineHeight = 0;
					}

					t.animateStyle( 'lineHeight', targetLineHeight, { duration: 50 } ).then( t.complete );
				}
			}
		});

		div = ractive.find( 'div' );
		t.equal( div.style.lineHeight, 0 );
	});

	test( 'Nodes are detached synchronously if there are no outro transitions (#856)', t => {
		const ractive = new Ractive({
			el: fixture,
			template: '{{#if foo}}<div intro="test">intro</div>{{else}}<div class="target">no outro</div>{{/if}}'
		});

		const target = ractive.find( '.target' );
		t.ok( fixture.contains( target ) );

		ractive.set( 'foo', true );
		t.ok( !fixture.contains( target ) );
	});

	test( 'Regression test for #1157', t => {
		const done = t.async();

		new Ractive({
			el: fixture,
			template: '<div intro="test: { duration: {{ foo ? 1000 : 0 }} }"></div>',
			transitions: {
				test ( transition, params ) {
					t.deepEqual( params, { duration: 0 });
					done();
				}
			}
		});
	});

	test( 'Parameter objects are not polluted (#1239)', t => {
		const done = t.async();

		t.expect(3);

		let uid = 0;
		let objects = [];

		new Ractive({
			el: fixture,
			template: '{{#each list}}<p intro="foo:{}"></p>{{/each}}',
			transitions: {
				foo ( t, params ) {
					params = t.processParams( params, {
						uid: uid++
					});
					objects.push( params );
					t.complete();
				}
			},
			data: { list: [ 0, 0 ] },
			oncomplete () {
				t.ok( true );
				done();
			},
		});

		t.equal( objects.length, 2 );
		t.notEqual( objects[0], objects[1] );
	});

	test( 'processParams extends correctly if no default provided (#2446)', t => {
		new Ractive({
			el: fixture,
			template: '<p intro="foo:{duration: 1000}"></p>',
			transitions: {
				foo ( transition, params ) {
					params = transition.processParams( params );

					// Test that the duration param is present
					t.equal( params.duration, 1000 );
				}
			}
		});
	});

	test( 'An intro will be aborted if a corresponding outro begins before it completes', t => {
		var ractive, tooLate;

		const done = t.async();
		t.expect( 0 );

		ractive = new Ractive({
			el: fixture,
			template: '{{#showBox}}<div intro="wait:2000" outro="wait:1"></div>{{/showBox}}',
			transitions: {
				wait: function ( t, ms ) {
					setTimeout( t.complete, ms );
				}
			}
		});

		ractive.set( 'showBox', true ).then( function () {
			if ( !tooLate ) {
				done();
			}
		});

		setTimeout( function () {
			ractive.set( 'showBox', false );
		}, 0 );

		setTimeout( function () {
			tooLate = true;
		}, 200 );
	});

	test( 'processParams extends correctly if no default provided (#2446)', t => {
		new Ractive({
			el: fixture,
			template: '<p intro="foo:{duration: 1000}"></p>',
			transitions: {
				foo ( transition, params ) {
					params = transition.processParams( params );

					// Test that the duration param is present
					t.equal( params.duration, 1000 );
				}
			}
		});
	});

	test( 'Conditional sections that become truthy are not rendered if a parent simultaneously becomes falsy (#1483)', t => {
		let transitionRan = false;
		const done = t.async();
		t.expect(1);

		const ractive = new Ractive({
			el: fixture,
			template: `
				{{#if foo.length || bar.length}}
					{{#if foo === bar}}
						<span intro-outro='x'></span>
					{{/if}}
				{{/if}}`,
			transitions: {
				x ( t ) {
					transitionRan = true;
					setTimeout( t.complete, 0 );
				}
			},
			data: {
				foo: '',
				bar: ''
			},
			oncomplete () { done(); }
		});

		ractive.set( 'foo', 'x' );
		ractive.set( 'foo', '' );

		t.ok( !transitionRan );
	});

	test( 'Nodes that are affected by deferred observers should actually get dettached (#2310)', t => {
		const r = new Ractive({
			el: fixture,
			template: `{{#if bar}}<span>baz</span>{{/if}}`,
			data: { foo: true, bar: true }
		});

		r.observe( 'foo', v => r.set( 'bar', v ), { defer: true } );

		t.htmlEqual( fixture.innerHTML, '<span>baz</span>' );
		r.set( 'foo', false );
		t.htmlEqual( fixture.innerHTML, '' );
		r.set( 'foo', true );
		t.htmlEqual( fixture.innerHTML, '<span>baz</span>' );
	});

	if ( !/phantom/i.test( navigator.userAgent ) ) {
		test( 'Nodes not affected by a transition should be immediately handled (#2027)', t => {
			const done = t.async();
			t.expect( 3 );

			function trans() {
				t.ok( true, 'transition actually ran' );
				return new Promise( ok => setTimeout( ok, 400 ) );
			}
			const r = new Ractive({
				el: fixture,
				template: `{{#if foo}}<span outro="trans" id="span1" /><span id="span2" />{{/if}}`,
				data: { foo: true },
				transitions: { trans }
			});

			r.set( 'foo', false ).then( done, done );
			t.ok( !/span2/.test( fixture.innerHTML ), 'span2 is gone immediately' );
			t.ok( /span1/.test( fixture.innerHTML ), 'span1 hangs around until the transition is done' );
		});
	}

	test( 'Context of transition function is current instance', t => {
		t.expect( 1 );

		const ractive = new Ractive({
			el: fixture,
			template: `{{#if visible}}<div intro='test'></div>{{/if}}`,
			data: { visible: false },
			transitions: {
				test ( transition ) {
					t.ok( this === ractive );
					transition.complete();
				}
			}
		});

		ractive.set( 'visible', true );
	});

	test( 'intro transitions can be conditional', t => {
		let count = 0;
		const r = new Ractive({
			el: fixture,
			template: `{{#if foo}}<div {{#if bar}}intro="go"{{/if}}></div>{{/if}}`,
			data: { foo: true, bar: true },
			transitions: {
				go ( t ) {
					count++;
					t.complete();
				}
			}
		});

		t.equal( count, 1 );
		r.set({ foo: false, bar: false });
		r.set( 'foo', true );
		t.equal( count, 1 );
		r.set({ foo: false, bar: true });
		r.set( 'foo', true );
		t.equal( count, 2 );
	});

	test( 'outro transitions can be conditional', t => {
		let count = 0;
		const r = new Ractive({
			el: fixture,
			template: `{{#if foo}}<div {{#if bar}}outro="go"{{/if}}></div>{{/if}}`,
			data: { foo: true, bar: true },
			transitions: {
				go ( t ) {
					count++;
					t.complete();
				}
			}
		});

		t.equal( count, 0 );
		r.set({ foo: false, bar: false });
		t.equal( count, 1 );
		r.set( 'foo', true );
		r.set( 'foo', false );
		t.equal( count, 1 );
		r.set( 'bar', true );
		r.set( 'foo', true );
		r.set( 'foo', false );
		t.equal( count, 2 );
	});

	test( 'intro-outro transitions can be conditional', t => {
		let count = 0;
		const r = new Ractive({
			el: fixture,
			template: `{{#if foo}}<div {{#if bar}}intro-outro="go"{{/if}}></div>{{/if}}`,
			data: { foo: true, bar: true },
			transitions: {
				go ( t ) {
					count++;
					t.complete();
				}
			}
		});

		t.equal( count, 1 );
		r.set({ foo: false, bar: false });
		t.equal( count, 2 );
		r.set( 'foo', true );
		r.set( 'foo', false );
		t.equal( count, 2 );
		r.set( 'bar', true );
		r.set( 'foo', true );
		r.set( 'foo', false );
		t.equal( count, 4 );
	});

	test( 'intros can be named attributes', t => {
		let count = 0;
		const r = new Ractive({
			el: fixture,
			template: '{{#if foo}}<div go-in></div>{{/if}}',
			data: { foo: true },
			transitions: {
				go ( t ) {
					count++;
					t.complete();
				}
			}
		});

		t.equal( count, 1 );
		r.set( 'foo', false );
		r.set( 'foo', true );
		t.equal( count, 2 );
	});

	test( 'outros can be named attributes', t => {
		let count = 0;
		const r = new Ractive({
			el: fixture,
			template: '{{#if foo}}<div go-out></div>{{/if}}',
			data: { foo: true },
			transitions: {
				go ( t ) {
					count++;
					t.complete();
				}
			}
		});

		r.set( 'foo', false );
		t.equal( count, 1 );
		r.set( 'foo', true );
		r.set( 'foo', false );
		t.equal( count, 2 );
	});

	test( 'intro-outros can be named attributes', t => {
		let count = 0;
		const r = new Ractive({
			el: fixture,
			template: '{{#if foo}}<div go-in-out></div>{{/if}}',
			data: { foo: true },
			transitions: {
				go ( t ) {
					count++;
					t.complete();
				}
			}
		});

		t.equal( count, 1 );
		r.set( 'foo', false );
		t.equal( count, 2 );
		r.set( 'foo', true );
		t.equal( count, 3 );
		r.set( 'foo', false );
		t.equal( count, 4 );
	});


	test( 'named attribute transitions can have normal expression args', t => {
		let count = 0;
		new Ractive({
			el: fixture,
			template: `{{#if foo}}<div go-in="bar, 'bat'"></div>{{/if}}`,
			data: { foo: true, bar: 'foo' },
			transitions: {
				go ( trans, bar, str ) {
					count++;
					t.equal( bar, 'foo' );
					t.equal( str, 'bat' );
					trans.complete();
				}
			}
		});

		t.equal( count, 1 );
	});

	test( 'old-style transition args bind correctly in an iterative section', t => {
		t.expect( 1 );
		const done = t.async();

		const r = new Ractive({
			el: fixture,
			template: '{{#each foo:i}}<div intro-outro="go:{ delay: {{ delay * 10 + i }} }" />{{/each}}',
			data: {
				delay: 10
			},
			transitions: {
				go ( trans, opts ) {
					t.equal( opts.delay, 100 );
					trans.complete();
				}
			}
		});

		r.push( 'foo', true ).then( done, done );
	});
}
