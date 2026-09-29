<script lang="ts">
	import { lang } from '$lib/core/i18n';
	import type { CardEditorProps } from '../types';
	import type { HeaderCard } from './descriptor';
	import EntityField from '../../edit/EntityField.svelte';
	import IconField from '../../edit/IconField.svelte';
	import ImageField from '../../edit/ImageField.svelte';
	import TextField from '../../edit/TextField.svelte';

	let { initial: initialProp, onchange }: CardEditorProps<HeaderCard> = $props();

	// remounted per target and type, so the initial value is all the form needs
	// svelte-ignore state_referenced_locally
	const initial = initialProp;

	let title = $state(initial?.title ?? '');
	let subtitle = $state(initial?.subtitle ?? '');
	let icon = $state(initial?.icon ?? 'home');
	let tempEntity = $state(initial?.temp_entity ?? '');
	let humidityEntity = $state(initial?.humidity_entity ?? '');
	let backgroundImage = $state(initial?.background_image ?? '');

	$effect(() => {
		onchange({
			fields: {
				title: title.trim() || undefined,
				subtitle: subtitle.trim() || undefined,
				icon: icon.trim() || undefined,
				temp_entity: tempEntity.trim() || undefined,
				humidity_entity: humidityEntity.trim() || undefined,
				background_image: backgroundImage.trim() || undefined
			}
		});
	});
</script>

<TextField
	label={$lang('hearth_title')}
	bind:value={title}
	placeholder={$lang('hearth_example_header_title')}
/>
<TextField
	label={$lang('hearth_subtitle')}
	bind:value={subtitle}
	placeholder={$lang('hearth_example_page_summary')}
/>
<IconField label={$lang('icon')} bind:value={icon} placeholder="home" />
<EntityField
	label={$lang('hearth_temperature_sensor_optional')}
	bind:value={tempEntity}
	domains={['sensor']}
/>
<EntityField
	label={$lang('hearth_humidity_sensor_optional')}
	bind:value={humidityEntity}
	domains={['sensor']}
/>
<ImageField label={$lang('hearth_background_image')} bind:value={backgroundImage} />
