% Copyright © Cyberismo Ltd and contributors 2025
%
% License: https://github.com/CyberismoCom/cyberismo/blob/main/LICENSE
% The use of the Cyberismo trademark: https://cyberismo.com/trademark-policy/
% This content is distributed in the hope that it will be useful, but
% WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
% FITNESS FOR A PARTICULAR PURPOSE.

% lua functions

#script (lua)
local os = require("os")
local string = require("string")
local utf8 = require("utf8")

local Functions = {}

function Functions.concatenate(...)
    -- Concatenate strings, constants or numbers as a single string
    -- Args: A variable number of Clingo Strings, Numbers, or Functions (constants)
    -- Returns: All the arguments concatenated together as a Clingo string
    local result = ""
    local args = {...}
    
    for _, arg in ipairs(args) do
        if arg.type == "String" then
            result = result .. arg.string
        elseif arg.type == "Number" then
            result = result .. tostring(arg.number)
        elseif arg.type == "Function" then
            -- constants such as card keys are represented as function symbols
            result = result .. arg.name
        end
    end
    
    return clingo.String(result)
end

function Functions.daysSince(isodate)
    -- Calculates the number of dates since a date
    -- Args: isodate: a Clingo string that is a date in the ISO format
    -- Returns: A Clingo number that is the number of days since isodate
    local success, userdate = pcall(function()
        local year, month, day = isodate.string:match("(%d+)-(%d+)-(%d+)")
        return os.time({year = tonumber(year), month = tonumber(month), day = tonumber(day)})
    end)
    
    if not success then
        return clingo.Number(0)
    end
    
    local today = os.time()
    local diff = os.difftime(today, userdate)
    local days = math.floor(diff / (24 * 60 * 60))
    
    return clingo.Number(days)
end

function Functions.today()
    -- Returns the current date in the ISO format as a Clingo string
    local t = os.date("*t")
    local dateStr = string.format("%04d-%02d-%02d", t.year, t.month, t.day)
    return clingo.String(dateStr)
end

function Functions.wrap(original_text)
    -- Adds line break tags <br/> and HTML escaping in a string
    -- to make the string work better as a title in graphs
    -- Args: original_text: A Clingo string that needs to be wrapped and escaped
    -- Returns: A Clingo string that has been wrapped and escaped to work in diagrams
    local function htmlEscape(str)
        local entities = {
            ["&"] = "&amp;",
            ["<"] = "&lt;",
            [">"] = "&gt;",
            ['"'] = "&quot;",
            ["'"] = "&#39;"
        }
        return str:gsub("[&<>\"']", entities)
    end
    
    local function wrapText(text, width)
        local lines = {}
        local currentLine = ""
        local currentLength = 0
        
        for word in text:gmatch("%S+") do
            if currentLength + #word > width then
                table.insert(lines, currentLine)
                currentLine = word
                currentLength = #word
            else
                if currentLine ~= "" then
                    currentLine = currentLine .. " " .. word
                    currentLength = currentLength + 1 + #word
                else
                    currentLine = word
                    currentLength = #word
                end
            end
        end
        
        if currentLine ~= "" then
            table.insert(lines, currentLine)
        end
        
        return lines
    end
    
    local success, result = pcall(function()
        local lineWidth = 27
        local lines = wrapText(original_text.string, lineWidth)
        local numLines = #lines
        local result = ""
        
        for i, line in ipairs(lines) do
            result = result .. htmlEscape(line)
            if i < numLines then
                result = result .. "<br/>"
            end
        end
        
        return result
    end)
    
    if not success then
        return clingo.String("")
    end
    
    return clingo.String(result)
end

function main(prg)
    prg:ground({{"base", {}}}, Functions)
    prg:solve()
end
#end. 