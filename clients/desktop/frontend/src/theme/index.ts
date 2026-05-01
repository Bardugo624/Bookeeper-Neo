// Bookeeper Neo — PrimeVue theme preset.
//
// Aura base + Bookeeper brand tokens.
// Brand tone: editoriale, sereno, "biblioteca di casa". Verde-salvia
// come primary (calmo, libroso), neutralità grigio caldo (zinc), accenti
// terracotta per warning/lent. Dark mode pronto via .dark selector.
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const BookeeperPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '#f1f7f4',
            100: '#dcebe2',
            200: '#bcd6c8',
            300: '#92baa6',
            400: '#6a9c83',
            500: '#4d8369',
            600: '#3b6953',
            700: '#305545',
            800: '#284439',
            900: '#223830',
            950: '#10201a',
        },
        colorScheme: {
            light: {
                surface: {
                    0: '#ffffff',
                    50: '#fbfaf8',
                    100: '#f5f3ef',
                    200: '#ebe7e0',
                    300: '#d8d2c8',
                    400: '#a9a195',
                    500: '#7a7268',
                    600: '#5b554d',
                    700: '#3f3a34',
                    800: '#27241f',
                    900: '#181613',
                    950: '#0c0b0a',
                },
            },
            dark: {
                surface: {
                    0: '#ffffff',
                    50: '#f4f4f3',
                    100: '#d8d6d2',
                    200: '#a9a59e',
                    300: '#807c74',
                    400: '#5b574f',
                    500: '#403d37',
                    600: '#2c2a25',
                    700: '#1f1d1a',
                    800: '#161512',
                    900: '#0e0d0b',
                    950: '#070706',
                },
            },
        },
    },
});
