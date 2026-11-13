import { Input, Select } from 'antd';
import React from 'react'
import { useEffect } from 'react';
import InputWithLabel from './InputWithLabel';
import useDebounce from './useDebounce';

export default function SearchComponent({
    masterState,            // The masterState that is to be searched (Array of jsons)
    state,                  // The state that is set
    setState,               // The setState function of the state

    searchOptions,          // The options of keys to search in [{keyName: 'key1', label: 'Key 1'}]

    defaultSearchKeys,      // The default search keys to be searched [{keyName: 'key1', label: 'Key 1'}]
    defaultSearchText = '', // Optional initial search text

    isLabelInline=true,    // Whether the label is inline or not
    onSearchEnded=(search, keys) => {},               // The onSearch function that is to be called when the search is done
    searchInputWidth='250px', // The width of the search input
    searchSelectWidth='270px', // The width of the search select
    maxTagCount=2, // The maximum number of tags to show in the select
    searchDebounceTime=500, // The debounce time for the search
    allowSearchInLabel=false, // Whether to allow search in label or not
}) {
    const [searchKeys, setSearchKeys] = React.useState(defaultSearchKeys || searchOptions.map(option => option.keyName));
    const [searchText, setSearchText] = React.useState('');

    const debouncedSearch = useDebounce(searchText, searchDebounceTime);

    const handleSearch = () => {
        // Return all rows that have the search text in any of the search keys
        if(debouncedSearch.length === 0 || searchKeys.length === 0) {
            setState(masterState);
            return;
        }
        const filteredRows = masterState.filter(row => {
            return searchKeys.some(key => {
                try {
                    return String(row[key] ?? "").toLowerCase().includes(debouncedSearch.toLowerCase());
                } catch (err) {
                    return false;
                }
            });
        });
        setState(filteredRows);
        onSearchEnded(debouncedSearch, searchKeys);
    }

    useEffect(() => {
        // console.log("searching")
        handleSearch();
    }, [masterState, searchKeys, debouncedSearch]);

    useEffect(() => {
        if (Array.isArray(defaultSearchKeys) && defaultSearchKeys.length > 0) {
            setSearchKeys(defaultSearchKeys);
        }
        // Re-run only when the actual contents change, not on every render
        // (callers commonly pass an inline array literal as this prop, which
        // gets a new reference every render and would otherwise stomp on the
        // user's own "Search In" selection as soon as they typed anything).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(defaultSearchKeys)]);

    useEffect(() => {
        if (typeof defaultSearchText === 'string') {
            setSearchText(defaultSearchText);
        }
    }, [defaultSearchText]);

    return (
        <div style={{display: 'inline-flex', alignItems: isLabelInline ? "center" : "flex-end", gap: '4px'}}>
            <InputWithLabel isInline={isLabelInline} label="Search In" labelWidth="65px">
                <Select
                    showSearch={allowSearchInLabel}
                    mode='multiple'
                    value={searchKeys}
                    onChange={(value) => setSearchKeys(value)}
                    style={{ width: searchSelectWidth } }
                    maxTagCount={maxTagCount}
                >
                    {searchOptions.map((option) => (
                        <Select.Option key={option.keyName} value={option.keyName}>{option.label}</Select.Option>
                    ))}
                </Select>
            </InputWithLabel>
            <InputWithLabel>
                <Input
                    placeholder='Search'
                    style={{ width: searchInputWidth } }
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                />
            </InputWithLabel>
        </div>
    )
}
