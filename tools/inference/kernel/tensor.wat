(module
  (type (;0;) (func (param f64) (result f64)))
  (type (;1;) (func (param i32 i32 f32 f32 i32 i32) (result i32)))
  (type (;2;) (func (param i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type (;3;) (func (param i32 i32) (result i32)))
  (type (;4;) (func (param i32 i32 f32 i32 i32) (result i32)))
  (type (;5;) (func (param i32 i32 i32 i32 f32 i32 i32) (result i32)))
  (import "env" "sqrt" (func (;0;) (type 0)))
  (func (;1;) (type 1) (param i32 i32 f32 f32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 41
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        local.get 40
                                                        br_table 0 (;@26;) 1 (;@25;) 2 (;@24;) 3 (;@23;) 4 (;@22;) 5 (;@21;) 6 (;@20;) 7 (;@19;) 8 (;@18;) 9 (;@17;) 10 (;@16;) 11 (;@15;) 12 (;@14;) 13 (;@13;) 14 (;@12;) 15 (;@11;) 16 (;@10;) 17 (;@9;) 18 (;@8;) 19 (;@7;) 20 (;@6;) 21 (;@5;) 22 (;@4;) 23 (;@3;) 25 (;@1;)
                                                      end
                                                      global.get 0
                                                      local.set 6
                                                      global.get 0
                                                      i32.const 4
                                                      i32.add
                                                      global.set 0
                                                      local.get 6
                                                      local.get 0
                                                      i32.store
                                                      global.get 0
                                                      local.set 7
                                                      global.get 0
                                                      i32.const 4
                                                      i32.add
                                                      global.set 0
                                                      local.get 7
                                                      local.get 1
                                                      i32.store
                                                      global.get 0
                                                      local.set 8
                                                      global.get 0
                                                      i32.const 4
                                                      i32.add
                                                      global.set 0
                                                      local.get 8
                                                      local.get 2
                                                      f32.store
                                                      global.get 0
                                                      local.set 9
                                                      global.get 0
                                                      i32.const 4
                                                      i32.add
                                                      global.set 0
                                                      local.get 9
                                                      local.get 3
                                                      f32.store
                                                      global.get 0
                                                      local.set 10
                                                      global.get 0
                                                      i32.const 4
                                                      i32.add
                                                      global.set 0
                                                      local.get 10
                                                      local.get 4
                                                      i32.store
                                                      global.get 0
                                                      local.set 11
                                                      global.get 0
                                                      i32.const 4
                                                      i32.add
                                                      global.set 0
                                                      local.get 11
                                                      local.get 5
                                                      i32.store
                                                      global.get 0
                                                      local.set 12
                                                      global.get 0
                                                      i32.const 1
                                                      i32.add
                                                      global.set 0
                                                      local.get 12
                                                      i32.const 1
                                                      i32.store8
                                                      local.get 7
                                                      i32.load
                                                      local.set 13
                                                      local.get 13
                                                      i32.const 0
                                                      i32.lt_s
                                                      local.set 14
                                                      local.get 14
                                                      if  ;; label = @26
                                                        i32.const 3
                                                        local.set 40
                                                        br 24 (;@2;)
                                                      else
                                                        i32.const 4
                                                        local.set 40
                                                        br 24 (;@2;)
                                                      end
                                                    end
                                                    local.get 41
                                                    global.set 0
                                                    i32.const 0
                                                    return
                                                  end
                                                  global.get 0
                                                  local.set 15
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 15
                                                  i32.const 0
                                                  i32.store
                                                  i32.const 12
                                                  local.set 40
                                                  br 21 (;@2;)
                                                end
                                                i32.const 5
                                                local.set 40
                                                br 20 (;@2;)
                                              end
                                              local.get 7
                                              i32.load
                                              local.set 16
                                              local.get 11
                                              i32.load
                                              local.set 17
                                              local.get 16
                                              local.get 17
                                              i32.gt_s
                                              local.set 18
                                              local.get 12
                                              local.get 18
                                              i32.store8
                                              i32.const 5
                                              local.set 40
                                              br 19 (;@2;)
                                            end
                                            local.get 12
                                            i32.load8_u
                                            local.set 19
                                            local.get 19
                                            if  ;; label = @21
                                              i32.const 6
                                              local.set 40
                                              br 19 (;@2;)
                                            else
                                              i32.const 7
                                              local.set 40
                                              br 19 (;@2;)
                                            end
                                          end
                                          i32.const 0
                                          i32.const 1
                                          i32.sub
                                          local.set 20
                                          local.get 41
                                          global.set 0
                                          local.get 20
                                          return
                                        end
                                        i32.const 8
                                        local.set 40
                                        br 16 (;@2;)
                                      end
                                      i32.const 2
                                      local.set 40
                                      br 15 (;@2;)
                                    end
                                    i32.const 8
                                    local.set 40
                                    br 14 (;@2;)
                                  end
                                  local.get 7
                                  i32.load
                                  local.set 21
                                  local.get 41
                                  global.set 0
                                  local.get 21
                                  return
                                end
                                i32.const 10
                                local.set 40
                                br 12 (;@2;)
                              end
                              local.get 15
                              i32.load
                              local.set 22
                              local.get 7
                              i32.load
                              local.set 23
                              local.get 22
                              local.get 23
                              i32.lt_s
                              local.set 24
                              local.get 24
                              if  ;; label = @14
                                i32.const 16
                                local.set 40
                                br 12 (;@2;)
                              else
                                i32.const 17
                                local.set 40
                                br 12 (;@2;)
                              end
                            end
                            i32.const 11
                            local.set 40
                            br 10 (;@2;)
                          end
                          i32.const 12
                          local.set 40
                          br 9 (;@2;)
                        end
                        i32.const 14
                        local.set 40
                        br 8 (;@2;)
                      end
                      local.get 6
                      i32.load
                      local.set 25
                      local.get 15
                      i32.load
                      local.set 26
                      local.get 25
                      local.get 26
                      i32.const 4
                      i32.mul
                      i32.add
                      local.set 27
                      local.get 27
                      f32.load
                      local.set 28
                      local.get 8
                      f32.load
                      local.set 29
                      local.get 28
                      local.get 29
                      f32.mul
                      local.set 30
                      local.get 9
                      f32.load
                      local.set 31
                      local.get 30
                      local.get 31
                      f32.add
                      local.set 32
                      local.get 10
                      i32.load
                      local.set 33
                      local.get 10
                      i32.load
                      local.set 34
                      local.get 15
                      i32.load
                      local.set 35
                      local.get 10
                      i32.load
                      local.set 36
                      local.get 36
                      local.get 35
                      i32.const 4
                      i32.mul
                      i32.add
                      local.set 37
                      local.get 37
                      local.get 32
                      f32.store
                      local.get 15
                      i32.load
                      local.set 38
                      local.get 38
                      i32.const 1
                      i32.add
                      local.set 39
                      local.get 15
                      local.get 39
                      i32.store
                      i32.const 18
                      local.set 40
                      br 7 (;@2;)
                    end
                    i32.const 11
                    local.set 40
                    br 6 (;@2;)
                  end
                  i32.const 15
                  local.set 40
                  br 5 (;@2;)
                end
                i32.const 18
                local.set 40
                br 4 (;@2;)
              end
              i32.const 12
              local.set 40
              br 3 (;@2;)
            end
            i32.const 23
            local.set 40
            br 2 (;@2;)
          end
          i32.const 21
          local.set 40
          br 1 (;@2;)
        end
        i32.const 1
        local.set 40
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;2;) (type 1) (param i32 i32 f32 f32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 8
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 7
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                local.get 5
                call 1
                local.set 6
                local.get 8
                global.set 0
                local.get 6
                return
              end
              local.get 8
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 7
            br 2 (;@2;)
          end
          i32.const 2
          local.set 7
          br 1 (;@2;)
        end
        i32.const 1
        local.set 7
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;3;) (type 2) (param i32 i32 i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32)
    global.get 0
    local.set 86
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                block  ;; label = @55
                                                                                                                  block  ;; label = @56
                                                                                                                    local.get 85
                                                                                                                    br_table 0 (;@56;) 1 (;@55;) 2 (;@54;) 3 (;@53;) 4 (;@52;) 5 (;@51;) 6 (;@50;) 7 (;@49;) 8 (;@48;) 9 (;@47;) 10 (;@46;) 11 (;@45;) 12 (;@44;) 13 (;@43;) 14 (;@42;) 15 (;@41;) 16 (;@40;) 17 (;@39;) 18 (;@38;) 19 (;@37;) 20 (;@36;) 21 (;@35;) 22 (;@34;) 23 (;@33;) 24 (;@32;) 25 (;@31;) 26 (;@30;) 27 (;@29;) 28 (;@28;) 29 (;@27;) 30 (;@26;) 31 (;@25;) 32 (;@24;) 33 (;@23;) 34 (;@22;) 35 (;@21;) 36 (;@20;) 37 (;@19;) 38 (;@18;) 39 (;@17;) 40 (;@16;) 41 (;@15;) 42 (;@14;) 43 (;@13;) 44 (;@12;) 45 (;@11;) 46 (;@10;) 47 (;@9;) 48 (;@8;) 49 (;@7;) 50 (;@6;) 51 (;@5;) 52 (;@4;) 53 (;@3;) 55 (;@1;)
                                                                                                                  end
                                                                                                                  global.get 0
                                                                                                                  local.set 7
                                                                                                                  global.get 0
                                                                                                                  i32.const 4
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 7
                                                                                                                  local.get 0
                                                                                                                  i32.store
                                                                                                                  global.get 0
                                                                                                                  local.set 8
                                                                                                                  global.get 0
                                                                                                                  i32.const 4
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 8
                                                                                                                  local.get 1
                                                                                                                  i32.store
                                                                                                                  global.get 0
                                                                                                                  local.set 9
                                                                                                                  global.get 0
                                                                                                                  i32.const 4
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 9
                                                                                                                  local.get 2
                                                                                                                  i32.store
                                                                                                                  global.get 0
                                                                                                                  local.set 10
                                                                                                                  global.get 0
                                                                                                                  i32.const 4
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 10
                                                                                                                  local.get 3
                                                                                                                  i32.store
                                                                                                                  global.get 0
                                                                                                                  local.set 11
                                                                                                                  global.get 0
                                                                                                                  i32.const 4
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 11
                                                                                                                  local.get 4
                                                                                                                  i32.store
                                                                                                                  global.get 0
                                                                                                                  local.set 12
                                                                                                                  global.get 0
                                                                                                                  i32.const 4
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 12
                                                                                                                  local.get 5
                                                                                                                  i32.store
                                                                                                                  global.get 0
                                                                                                                  local.set 13
                                                                                                                  global.get 0
                                                                                                                  i32.const 4
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 13
                                                                                                                  local.get 6
                                                                                                                  i32.store
                                                                                                                  global.get 0
                                                                                                                  local.set 14
                                                                                                                  global.get 0
                                                                                                                  i32.const 1
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 14
                                                                                                                  i32.const 1
                                                                                                                  i32.store8
                                                                                                                  global.get 0
                                                                                                                  local.set 15
                                                                                                                  global.get 0
                                                                                                                  i32.const 1
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 15
                                                                                                                  i32.const 1
                                                                                                                  i32.store8
                                                                                                                  global.get 0
                                                                                                                  local.set 16
                                                                                                                  global.get 0
                                                                                                                  i32.const 1
                                                                                                                  i32.add
                                                                                                                  global.set 0
                                                                                                                  local.get 16
                                                                                                                  i32.const 1
                                                                                                                  i32.store8
                                                                                                                  local.get 9
                                                                                                                  i32.load
                                                                                                                  local.set 17
                                                                                                                  local.get 17
                                                                                                                  i32.const 0
                                                                                                                  i32.le_s
                                                                                                                  local.set 18
                                                                                                                  local.get 18
                                                                                                                  if  ;; label = @56
                                                                                                                    i32.const 3
                                                                                                                    local.set 85
                                                                                                                    br 54 (;@2;)
                                                                                                                  else
                                                                                                                    i32.const 4
                                                                                                                    local.set 85
                                                                                                                    br 54 (;@2;)
                                                                                                                  end
                                                                                                                end
                                                                                                                local.get 86
                                                                                                                global.set 0
                                                                                                                i32.const 0
                                                                                                                return
                                                                                                              end
                                                                                                              global.get 0
                                                                                                              local.set 19
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 19
                                                                                                              i32.const 0
                                                                                                              i32.store
                                                                                                              global.get 0
                                                                                                              local.set 20
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 20
                                                                                                              i32.const 0
                                                                                                              i32.store
                                                                                                              global.get 0
                                                                                                              local.set 21
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 21
                                                                                                              i32.const 0
                                                                                                              i32.store
                                                                                                              i32.const 0
                                                                                                              f32.convert_i32_s
                                                                                                              local.set 22
                                                                                                              global.get 0
                                                                                                              local.set 23
                                                                                                              global.get 0
                                                                                                              i32.const 4
                                                                                                              i32.add
                                                                                                              global.set 0
                                                                                                              local.get 23
                                                                                                              local.get 22
                                                                                                              f32.store
                                                                                                              i32.const 18
                                                                                                              local.set 85
                                                                                                              br 51 (;@2;)
                                                                                                            end
                                                                                                            i32.const 5
                                                                                                            local.set 85
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          local.get 10
                                                                                                          i32.load
                                                                                                          local.set 24
                                                                                                          local.get 24
                                                                                                          i32.const 0
                                                                                                          i32.le_s
                                                                                                          local.set 25
                                                                                                          local.get 16
                                                                                                          local.get 25
                                                                                                          i32.store8
                                                                                                          i32.const 5
                                                                                                          local.set 85
                                                                                                          br 49 (;@2;)
                                                                                                        end
                                                                                                        local.get 16
                                                                                                        i32.load8_u
                                                                                                        local.set 26
                                                                                                        local.get 26
                                                                                                        if  ;; label = @51
                                                                                                          i32.const 6
                                                                                                          local.set 85
                                                                                                          br 49 (;@2;)
                                                                                                        else
                                                                                                          i32.const 7
                                                                                                          local.set 85
                                                                                                          br 49 (;@2;)
                                                                                                        end
                                                                                                      end
                                                                                                      i32.const 8
                                                                                                      local.set 85
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                    local.get 11
                                                                                                    i32.load
                                                                                                    local.set 27
                                                                                                    local.get 27
                                                                                                    i32.const 0
                                                                                                    i32.le_s
                                                                                                    local.set 28
                                                                                                    local.get 15
                                                                                                    local.get 28
                                                                                                    i32.store8
                                                                                                    i32.const 8
                                                                                                    local.set 85
                                                                                                    br 46 (;@2;)
                                                                                                  end
                                                                                                  local.get 15
                                                                                                  i32.load8_u
                                                                                                  local.set 29
                                                                                                  local.get 29
                                                                                                  if  ;; label = @48
                                                                                                    i32.const 9
                                                                                                    local.set 85
                                                                                                    br 46 (;@2;)
                                                                                                  else
                                                                                                    i32.const 10
                                                                                                    local.set 85
                                                                                                    br 46 (;@2;)
                                                                                                  end
                                                                                                end
                                                                                                i32.const 11
                                                                                                local.set 85
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              local.get 9
                                                                                              i32.load
                                                                                              local.set 30
                                                                                              local.get 13
                                                                                              i32.load
                                                                                              local.set 31
                                                                                              local.get 11
                                                                                              i32.load
                                                                                              local.set 32
                                                                                              local.get 31
                                                                                              local.get 32
                                                                                              i32.div_s
                                                                                              local.set 33
                                                                                              local.get 30
                                                                                              local.get 33
                                                                                              i32.gt_s
                                                                                              local.set 34
                                                                                              local.get 14
                                                                                              local.get 34
                                                                                              i32.store8
                                                                                              i32.const 11
                                                                                              local.set 85
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            local.get 14
                                                                                            i32.load8_u
                                                                                            local.set 35
                                                                                            local.get 35
                                                                                            if  ;; label = @45
                                                                                              i32.const 12
                                                                                              local.set 85
                                                                                              br 43 (;@2;)
                                                                                            else
                                                                                              i32.const 13
                                                                                              local.set 85
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                          end
                                                                                          i32.const 0
                                                                                          i32.const 1
                                                                                          i32.sub
                                                                                          local.set 36
                                                                                          local.get 86
                                                                                          global.set 0
                                                                                          local.get 36
                                                                                          return
                                                                                        end
                                                                                        i32.const 14
                                                                                        local.set 85
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      i32.const 2
                                                                                      local.set 85
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 14
                                                                                    local.set 85
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  local.get 9
                                                                                  i32.load
                                                                                  local.set 37
                                                                                  local.get 11
                                                                                  i32.load
                                                                                  local.set 38
                                                                                  local.get 37
                                                                                  local.get 38
                                                                                  i32.mul
                                                                                  local.set 39
                                                                                  local.get 86
                                                                                  global.set 0
                                                                                  local.get 39
                                                                                  return
                                                                                end
                                                                                i32.const 16
                                                                                local.set 85
                                                                                br 36 (;@2;)
                                                                              end
                                                                              local.get 19
                                                                              i32.load
                                                                              local.set 40
                                                                              local.get 9
                                                                              i32.load
                                                                              local.set 41
                                                                              local.get 40
                                                                              local.get 41
                                                                              i32.lt_s
                                                                              local.set 42
                                                                              local.get 42
                                                                              if  ;; label = @38
                                                                                i32.const 22
                                                                                local.set 85
                                                                                br 36 (;@2;)
                                                                              else
                                                                                i32.const 23
                                                                                local.set 85
                                                                                br 36 (;@2;)
                                                                              end
                                                                            end
                                                                            i32.const 17
                                                                            local.set 85
                                                                            br 34 (;@2;)
                                                                          end
                                                                          i32.const 18
                                                                          local.set 85
                                                                          br 33 (;@2;)
                                                                        end
                                                                        i32.const 20
                                                                        local.set 85
                                                                        br 32 (;@2;)
                                                                      end
                                                                      local.get 20
                                                                      i32.const 0
                                                                      i32.store
                                                                      i32.const 27
                                                                      local.set 85
                                                                      br 31 (;@2;)
                                                                    end
                                                                    i32.const 17
                                                                    local.set 85
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 21
                                                                  local.set 85
                                                                  br 29 (;@2;)
                                                                end
                                                                local.get 19
                                                                i32.load
                                                                local.set 43
                                                                local.get 43
                                                                i32.const 1
                                                                i32.add
                                                                local.set 44
                                                                local.get 19
                                                                local.get 44
                                                                i32.store
                                                                i32.const 48
                                                                local.set 85
                                                                br 28 (;@2;)
                                                              end
                                                              i32.const 25
                                                              local.set 85
                                                              br 27 (;@2;)
                                                            end
                                                            local.get 20
                                                            i32.load
                                                            local.set 45
                                                            local.get 11
                                                            i32.load
                                                            local.set 46
                                                            local.get 45
                                                            local.get 46
                                                            i32.lt_s
                                                            local.set 47
                                                            local.get 47
                                                            if  ;; label = @29
                                                              i32.const 31
                                                              local.set 85
                                                              br 27 (;@2;)
                                                            else
                                                              i32.const 32
                                                              local.set 85
                                                              br 27 (;@2;)
                                                            end
                                                          end
                                                          i32.const 26
                                                          local.set 85
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 27
                                                        local.set 85
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 29
                                                      local.set 85
                                                      br 23 (;@2;)
                                                    end
                                                    local.get 21
                                                    i32.const 0
                                                    i32.store
                                                    i32.const 0
                                                    f32.convert_i32_s
                                                    local.set 48
                                                    local.get 23
                                                    local.get 48
                                                    f32.store
                                                    i32.const 36
                                                    local.set 85
                                                    br 22 (;@2;)
                                                  end
                                                  i32.const 26
                                                  local.set 85
                                                  br 21 (;@2;)
                                                end
                                                i32.const 30
                                                local.set 85
                                                br 20 (;@2;)
                                              end
                                              local.get 23
                                              f32.load
                                              local.set 49
                                              local.get 12
                                              i32.load
                                              local.set 50
                                              local.get 12
                                              i32.load
                                              local.set 51
                                              local.get 19
                                              i32.load
                                              local.set 52
                                              local.get 11
                                              i32.load
                                              local.set 53
                                              local.get 52
                                              local.get 53
                                              i32.mul
                                              local.set 54
                                              local.get 20
                                              i32.load
                                              local.set 55
                                              local.get 54
                                              local.get 55
                                              i32.add
                                              local.set 56
                                              local.get 12
                                              i32.load
                                              local.set 57
                                              local.get 57
                                              local.get 56
                                              i32.const 4
                                              i32.mul
                                              i32.add
                                              local.set 58
                                              local.get 58
                                              local.get 49
                                              f32.store
                                              local.get 20
                                              i32.load
                                              local.set 59
                                              local.get 59
                                              i32.const 1
                                              i32.add
                                              local.set 60
                                              local.get 20
                                              local.get 60
                                              i32.store
                                              i32.const 45
                                              local.set 85
                                              br 19 (;@2;)
                                            end
                                            i32.const 34
                                            local.set 85
                                            br 18 (;@2;)
                                          end
                                          local.get 21
                                          i32.load
                                          local.set 61
                                          local.get 10
                                          i32.load
                                          local.set 62
                                          local.get 61
                                          local.get 62
                                          i32.lt_s
                                          local.set 63
                                          local.get 63
                                          if  ;; label = @20
                                            i32.const 40
                                            local.set 85
                                            br 18 (;@2;)
                                          else
                                            i32.const 41
                                            local.set 85
                                            br 18 (;@2;)
                                          end
                                        end
                                        i32.const 35
                                        local.set 85
                                        br 16 (;@2;)
                                      end
                                      i32.const 36
                                      local.set 85
                                      br 15 (;@2;)
                                    end
                                    i32.const 38
                                    local.set 85
                                    br 14 (;@2;)
                                  end
                                  local.get 23
                                  f32.load
                                  local.set 64
                                  local.get 7
                                  i32.load
                                  local.set 65
                                  local.get 19
                                  i32.load
                                  local.set 66
                                  local.get 10
                                  i32.load
                                  local.set 67
                                  local.get 66
                                  local.get 67
                                  i32.mul
                                  local.set 68
                                  local.get 21
                                  i32.load
                                  local.set 69
                                  local.get 68
                                  local.get 69
                                  i32.add
                                  local.set 70
                                  local.get 65
                                  local.get 70
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 71
                                  local.get 71
                                  f32.load
                                  local.set 72
                                  local.get 8
                                  i32.load
                                  local.set 73
                                  local.get 21
                                  i32.load
                                  local.set 74
                                  local.get 11
                                  i32.load
                                  local.set 75
                                  local.get 74
                                  local.get 75
                                  i32.mul
                                  local.set 76
                                  local.get 20
                                  i32.load
                                  local.set 77
                                  local.get 76
                                  local.get 77
                                  i32.add
                                  local.set 78
                                  local.get 73
                                  local.get 78
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 79
                                  local.get 79
                                  f32.load
                                  local.set 80
                                  local.get 72
                                  local.get 80
                                  f32.mul
                                  local.set 81
                                  local.get 64
                                  local.get 81
                                  f32.add
                                  local.set 82
                                  local.get 23
                                  local.get 82
                                  f32.store
                                  local.get 21
                                  i32.load
                                  local.set 83
                                  local.get 83
                                  i32.const 1
                                  i32.add
                                  local.set 84
                                  local.get 21
                                  local.get 84
                                  i32.store
                                  i32.const 42
                                  local.set 85
                                  br 13 (;@2;)
                                end
                                i32.const 35
                                local.set 85
                                br 12 (;@2;)
                              end
                              i32.const 39
                              local.set 85
                              br 11 (;@2;)
                            end
                            i32.const 42
                            local.set 85
                            br 10 (;@2;)
                          end
                          i32.const 36
                          local.set 85
                          br 9 (;@2;)
                        end
                        i32.const 33
                        local.set 85
                        br 8 (;@2;)
                      end
                      i32.const 33
                      local.set 85
                      br 7 (;@2;)
                    end
                    i32.const 27
                    local.set 85
                    br 6 (;@2;)
                  end
                  i32.const 24
                  local.set 85
                  br 5 (;@2;)
                end
                i32.const 24
                local.set 85
                br 4 (;@2;)
              end
              i32.const 18
              local.set 85
              br 3 (;@2;)
            end
            i32.const 53
            local.set 85
            br 2 (;@2;)
          end
          i32.const 51
          local.set 85
          br 1 (;@2;)
        end
        i32.const 1
        local.set 85
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;4;) (type 2) (param i32 i32 i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 9
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 8
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                local.get 5
                local.get 6
                call 3
                local.set 7
                local.get 9
                global.set 0
                local.get 7
                return
              end
              local.get 9
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 8
            br 2 (;@2;)
          end
          i32.const 2
          local.set 8
          br 1 (;@2;)
        end
        i32.const 1
        local.set 8
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;5;) (type 3) (param i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 4
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 3
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.set 2
                local.get 4
                global.set 0
                i32.const 0
                return
              end
              local.get 4
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 3
            br 2 (;@2;)
          end
          i32.const 2
          local.set 3
          br 1 (;@2;)
        end
        i32.const 1
        local.set 3
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;6;) (type 4) (param i32 i32 f32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 42
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              local.get 41
                                                              br_table 0 (;@29;) 1 (;@28;) 2 (;@27;) 3 (;@26;) 4 (;@25;) 5 (;@24;) 6 (;@23;) 7 (;@22;) 8 (;@21;) 9 (;@20;) 10 (;@19;) 11 (;@18;) 12 (;@17;) 13 (;@16;) 14 (;@15;) 15 (;@14;) 16 (;@13;) 17 (;@12;) 18 (;@11;) 19 (;@10;) 20 (;@9;) 21 (;@8;) 22 (;@7;) 23 (;@6;) 24 (;@5;) 25 (;@4;) 26 (;@3;) 28 (;@1;)
                                                            end
                                                            global.get 0
                                                            local.set 5
                                                            global.get 0
                                                            i32.const 4
                                                            i32.add
                                                            global.set 0
                                                            local.get 5
                                                            local.get 0
                                                            i32.store
                                                            global.get 0
                                                            local.set 6
                                                            global.get 0
                                                            i32.const 4
                                                            i32.add
                                                            global.set 0
                                                            local.get 6
                                                            local.get 1
                                                            i32.store
                                                            global.get 0
                                                            local.set 7
                                                            global.get 0
                                                            i32.const 4
                                                            i32.add
                                                            global.set 0
                                                            local.get 7
                                                            local.get 2
                                                            f32.store
                                                            global.get 0
                                                            local.set 8
                                                            global.get 0
                                                            i32.const 4
                                                            i32.add
                                                            global.set 0
                                                            local.get 8
                                                            local.get 3
                                                            i32.store
                                                            global.get 0
                                                            local.set 9
                                                            global.get 0
                                                            i32.const 4
                                                            i32.add
                                                            global.set 0
                                                            local.get 9
                                                            local.get 4
                                                            i32.store
                                                            global.get 0
                                                            local.set 10
                                                            global.get 0
                                                            i32.const 1
                                                            i32.add
                                                            global.set 0
                                                            local.get 10
                                                            i32.const 1
                                                            i32.store8
                                                            global.get 0
                                                            local.set 11
                                                            global.get 0
                                                            i32.const 1
                                                            i32.add
                                                            global.set 0
                                                            local.get 11
                                                            i32.const 1
                                                            i32.store8
                                                            local.get 6
                                                            i32.load
                                                            local.set 12
                                                            local.get 12
                                                            i32.const 0
                                                            i32.lt_s
                                                            local.set 13
                                                            local.get 13
                                                            if  ;; label = @29
                                                              i32.const 3
                                                              local.set 41
                                                              br 27 (;@2;)
                                                            else
                                                              i32.const 4
                                                              local.set 41
                                                              br 27 (;@2;)
                                                            end
                                                          end
                                                          local.get 42
                                                          global.set 0
                                                          i32.const 0
                                                          return
                                                        end
                                                        global.get 0
                                                        local.set 14
                                                        global.get 0
                                                        i32.const 4
                                                        i32.add
                                                        global.set 0
                                                        local.get 14
                                                        i32.const 0
                                                        i32.store
                                                        i32.const 15
                                                        local.set 41
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 5
                                                      local.set 41
                                                      br 23 (;@2;)
                                                    end
                                                    local.get 6
                                                    i32.load
                                                    local.set 15
                                                    local.get 9
                                                    i32.load
                                                    local.set 16
                                                    local.get 15
                                                    local.get 16
                                                    i32.gt_s
                                                    local.set 17
                                                    local.get 11
                                                    local.get 17
                                                    i32.store8
                                                    i32.const 5
                                                    local.set 41
                                                    br 22 (;@2;)
                                                  end
                                                  local.get 11
                                                  i32.load8_u
                                                  local.set 18
                                                  local.get 18
                                                  if  ;; label = @24
                                                    i32.const 6
                                                    local.set 41
                                                    br 22 (;@2;)
                                                  else
                                                    i32.const 7
                                                    local.set 41
                                                    br 22 (;@2;)
                                                  end
                                                end
                                                i32.const 8
                                                local.set 41
                                                br 20 (;@2;)
                                              end
                                              local.get 7
                                              f32.load
                                              local.set 19
                                              i32.const 0
                                              f32.convert_i32_s
                                              local.set 20
                                              local.get 19
                                              local.get 20
                                              f32.eq
                                              local.set 21
                                              local.get 10
                                              local.get 21
                                              i32.store8
                                              i32.const 8
                                              local.set 41
                                              br 19 (;@2;)
                                            end
                                            local.get 10
                                            i32.load8_u
                                            local.set 22
                                            local.get 22
                                            if  ;; label = @21
                                              i32.const 9
                                              local.set 41
                                              br 19 (;@2;)
                                            else
                                              i32.const 10
                                              local.set 41
                                              br 19 (;@2;)
                                            end
                                          end
                                          i32.const 0
                                          i32.const 1
                                          i32.sub
                                          local.set 23
                                          local.get 42
                                          global.set 0
                                          local.get 23
                                          return
                                        end
                                        i32.const 11
                                        local.set 41
                                        br 16 (;@2;)
                                      end
                                      i32.const 2
                                      local.set 41
                                      br 15 (;@2;)
                                    end
                                    i32.const 11
                                    local.set 41
                                    br 14 (;@2;)
                                  end
                                  local.get 6
                                  i32.load
                                  local.set 24
                                  local.get 42
                                  global.set 0
                                  local.get 24
                                  return
                                end
                                i32.const 13
                                local.set 41
                                br 12 (;@2;)
                              end
                              local.get 14
                              i32.load
                              local.set 25
                              local.get 6
                              i32.load
                              local.set 26
                              local.get 25
                              local.get 26
                              i32.lt_s
                              local.set 27
                              local.get 27
                              if  ;; label = @14
                                i32.const 19
                                local.set 41
                                br 12 (;@2;)
                              else
                                i32.const 20
                                local.set 41
                                br 12 (;@2;)
                              end
                            end
                            i32.const 14
                            local.set 41
                            br 10 (;@2;)
                          end
                          i32.const 15
                          local.set 41
                          br 9 (;@2;)
                        end
                        i32.const 17
                        local.set 41
                        br 8 (;@2;)
                      end
                      local.get 5
                      i32.load
                      local.set 28
                      local.get 14
                      i32.load
                      local.set 29
                      local.get 28
                      local.get 29
                      i32.const 4
                      i32.mul
                      i32.add
                      local.set 30
                      local.get 30
                      f32.load
                      local.set 31
                      local.get 7
                      f32.load
                      local.set 32
                      local.get 31
                      local.get 32
                      f32.div
                      local.set 33
                      local.get 8
                      i32.load
                      local.set 34
                      local.get 8
                      i32.load
                      local.set 35
                      local.get 14
                      i32.load
                      local.set 36
                      local.get 8
                      i32.load
                      local.set 37
                      local.get 37
                      local.get 36
                      i32.const 4
                      i32.mul
                      i32.add
                      local.set 38
                      local.get 38
                      local.get 33
                      f32.store
                      local.get 14
                      i32.load
                      local.set 39
                      local.get 39
                      i32.const 1
                      i32.add
                      local.set 40
                      local.get 14
                      local.get 40
                      i32.store
                      i32.const 21
                      local.set 41
                      br 7 (;@2;)
                    end
                    i32.const 14
                    local.set 41
                    br 6 (;@2;)
                  end
                  i32.const 18
                  local.set 41
                  br 5 (;@2;)
                end
                i32.const 21
                local.set 41
                br 4 (;@2;)
              end
              i32.const 15
              local.set 41
              br 3 (;@2;)
            end
            i32.const 26
            local.set 41
            br 2 (;@2;)
          end
          i32.const 24
          local.set 41
          br 1 (;@2;)
        end
        i32.const 1
        local.set 41
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;7;) (type 4) (param i32 i32 f32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 7
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 6
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                call 6
                local.set 5
                local.get 7
                global.set 0
                local.get 5
                return
              end
              local.get 7
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 6
            br 2 (;@2;)
          end
          i32.const 2
          local.set 6
          br 1 (;@2;)
        end
        i32.const 1
        local.set 6
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;8;) (type 5) (param i32 i32 i32 i32 f32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 f32 i32 f32 f32 i32 f32 f32 f32 f32 f64 f64 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 f32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 f32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 110
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                block  ;; label = @55
                                                                                                                  local.get 109
                                                                                                                  br_table 0 (;@55;) 1 (;@54;) 2 (;@53;) 3 (;@52;) 4 (;@51;) 5 (;@50;) 6 (;@49;) 7 (;@48;) 8 (;@47;) 9 (;@46;) 10 (;@45;) 11 (;@44;) 12 (;@43;) 13 (;@42;) 14 (;@41;) 15 (;@40;) 16 (;@39;) 17 (;@38;) 18 (;@37;) 19 (;@36;) 20 (;@35;) 21 (;@34;) 22 (;@33;) 23 (;@32;) 24 (;@31;) 25 (;@30;) 26 (;@29;) 27 (;@28;) 28 (;@27;) 29 (;@26;) 30 (;@25;) 31 (;@24;) 32 (;@23;) 33 (;@22;) 34 (;@21;) 35 (;@20;) 36 (;@19;) 37 (;@18;) 38 (;@17;) 39 (;@16;) 40 (;@15;) 41 (;@14;) 42 (;@13;) 43 (;@12;) 44 (;@11;) 45 (;@10;) 46 (;@9;) 47 (;@8;) 48 (;@7;) 49 (;@6;) 50 (;@5;) 51 (;@4;) 52 (;@3;) 54 (;@1;)
                                                                                                                end
                                                                                                                global.get 0
                                                                                                                local.set 7
                                                                                                                global.get 0
                                                                                                                i32.const 4
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 7
                                                                                                                local.get 0
                                                                                                                i32.store
                                                                                                                global.get 0
                                                                                                                local.set 8
                                                                                                                global.get 0
                                                                                                                i32.const 4
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 8
                                                                                                                local.get 1
                                                                                                                i32.store
                                                                                                                global.get 0
                                                                                                                local.set 9
                                                                                                                global.get 0
                                                                                                                i32.const 4
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 9
                                                                                                                local.get 2
                                                                                                                i32.store
                                                                                                                global.get 0
                                                                                                                local.set 10
                                                                                                                global.get 0
                                                                                                                i32.const 4
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 10
                                                                                                                local.get 3
                                                                                                                i32.store
                                                                                                                global.get 0
                                                                                                                local.set 11
                                                                                                                global.get 0
                                                                                                                i32.const 4
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 11
                                                                                                                local.get 4
                                                                                                                f32.store
                                                                                                                global.get 0
                                                                                                                local.set 12
                                                                                                                global.get 0
                                                                                                                i32.const 4
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 12
                                                                                                                local.get 5
                                                                                                                i32.store
                                                                                                                global.get 0
                                                                                                                local.set 13
                                                                                                                global.get 0
                                                                                                                i32.const 4
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 13
                                                                                                                local.get 6
                                                                                                                i32.store
                                                                                                                global.get 0
                                                                                                                local.set 14
                                                                                                                global.get 0
                                                                                                                i32.const 1
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 14
                                                                                                                i32.const 1
                                                                                                                i32.store8
                                                                                                                global.get 0
                                                                                                                local.set 15
                                                                                                                global.get 0
                                                                                                                i32.const 1
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 15
                                                                                                                i32.const 1
                                                                                                                i32.store8
                                                                                                                global.get 0
                                                                                                                local.set 16
                                                                                                                global.get 0
                                                                                                                i32.const 1
                                                                                                                i32.add
                                                                                                                global.set 0
                                                                                                                local.get 16
                                                                                                                i32.const 1
                                                                                                                i32.store8
                                                                                                                local.get 9
                                                                                                                i32.load
                                                                                                                local.set 17
                                                                                                                local.get 17
                                                                                                                i32.const 1
                                                                                                                i32.lt_s
                                                                                                                local.set 18
                                                                                                                local.get 18
                                                                                                                if  ;; label = @55
                                                                                                                  i32.const 3
                                                                                                                  local.set 109
                                                                                                                  br 53 (;@2;)
                                                                                                                else
                                                                                                                  i32.const 4
                                                                                                                  local.set 109
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                              end
                                                                                                              local.get 110
                                                                                                              global.set 0
                                                                                                              i32.const 0
                                                                                                              return
                                                                                                            end
                                                                                                            global.get 0
                                                                                                            local.set 19
                                                                                                            global.get 0
                                                                                                            i32.const 4
                                                                                                            i32.add
                                                                                                            global.set 0
                                                                                                            local.get 19
                                                                                                            i32.const 0
                                                                                                            i32.store
                                                                                                            i32.const 18
                                                                                                            local.set 109
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          i32.const 5
                                                                                                          local.set 109
                                                                                                          br 49 (;@2;)
                                                                                                        end
                                                                                                        local.get 10
                                                                                                        i32.load
                                                                                                        local.set 20
                                                                                                        local.get 20
                                                                                                        i32.const 1
                                                                                                        i32.lt_s
                                                                                                        local.set 21
                                                                                                        local.get 16
                                                                                                        local.get 21
                                                                                                        i32.store8
                                                                                                        i32.const 5
                                                                                                        local.set 109
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                      local.get 16
                                                                                                      i32.load8_u
                                                                                                      local.set 22
                                                                                                      local.get 22
                                                                                                      if  ;; label = @50
                                                                                                        i32.const 6
                                                                                                        local.set 109
                                                                                                        br 48 (;@2;)
                                                                                                      else
                                                                                                        i32.const 7
                                                                                                        local.set 109
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                    end
                                                                                                    i32.const 8
                                                                                                    local.set 109
                                                                                                    br 46 (;@2;)
                                                                                                  end
                                                                                                  local.get 9
                                                                                                  i32.load
                                                                                                  local.set 23
                                                                                                  local.get 13
                                                                                                  i32.load
                                                                                                  local.set 24
                                                                                                  local.get 10
                                                                                                  i32.load
                                                                                                  local.set 25
                                                                                                  local.get 24
                                                                                                  local.get 25
                                                                                                  i32.div_s
                                                                                                  local.set 26
                                                                                                  local.get 23
                                                                                                  local.get 26
                                                                                                  i32.gt_s
                                                                                                  local.set 27
                                                                                                  local.get 15
                                                                                                  local.get 27
                                                                                                  i32.store8
                                                                                                  i32.const 8
                                                                                                  local.set 109
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                local.get 15
                                                                                                i32.load8_u
                                                                                                local.set 28
                                                                                                local.get 28
                                                                                                if  ;; label = @47
                                                                                                  i32.const 9
                                                                                                  local.set 109
                                                                                                  br 45 (;@2;)
                                                                                                else
                                                                                                  i32.const 10
                                                                                                  local.set 109
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                              end
                                                                                              i32.const 11
                                                                                              local.set 109
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            local.get 11
                                                                                            f32.load
                                                                                            local.set 29
                                                                                            i32.const 0
                                                                                            f32.convert_i32_s
                                                                                            local.set 30
                                                                                            local.get 29
                                                                                            local.get 30
                                                                                            f32.le
                                                                                            local.set 31
                                                                                            local.get 14
                                                                                            local.get 31
                                                                                            i32.store8
                                                                                            i32.const 11
                                                                                            local.set 109
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          local.get 14
                                                                                          i32.load8_u
                                                                                          local.set 32
                                                                                          local.get 32
                                                                                          if  ;; label = @44
                                                                                            i32.const 12
                                                                                            local.set 109
                                                                                            br 42 (;@2;)
                                                                                          else
                                                                                            i32.const 13
                                                                                            local.set 109
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                        end
                                                                                        i32.const 0
                                                                                        i32.const 1
                                                                                        i32.sub
                                                                                        local.set 33
                                                                                        local.get 110
                                                                                        global.set 0
                                                                                        local.get 33
                                                                                        return
                                                                                      end
                                                                                      i32.const 14
                                                                                      local.set 109
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 2
                                                                                    local.set 109
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  i32.const 14
                                                                                  local.set 109
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                local.get 9
                                                                                i32.load
                                                                                local.set 34
                                                                                local.get 10
                                                                                i32.load
                                                                                local.set 35
                                                                                local.get 34
                                                                                local.get 35
                                                                                i32.mul
                                                                                local.set 36
                                                                                local.get 110
                                                                                global.set 0
                                                                                local.get 36
                                                                                return
                                                                              end
                                                                              i32.const 16
                                                                              local.set 109
                                                                              br 35 (;@2;)
                                                                            end
                                                                            local.get 19
                                                                            i32.load
                                                                            local.set 37
                                                                            local.get 9
                                                                            i32.load
                                                                            local.set 38
                                                                            local.get 37
                                                                            local.get 38
                                                                            i32.lt_s
                                                                            local.set 39
                                                                            local.get 39
                                                                            if  ;; label = @37
                                                                              i32.const 22
                                                                              local.set 109
                                                                              br 35 (;@2;)
                                                                            else
                                                                              i32.const 23
                                                                              local.set 109
                                                                              br 35 (;@2;)
                                                                            end
                                                                          end
                                                                          i32.const 17
                                                                          local.set 109
                                                                          br 33 (;@2;)
                                                                        end
                                                                        i32.const 18
                                                                        local.set 109
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 20
                                                                      local.set 109
                                                                      br 31 (;@2;)
                                                                    end
                                                                    i32.const 0
                                                                    f32.convert_i32_s
                                                                    local.set 40
                                                                    global.get 0
                                                                    local.set 41
                                                                    global.get 0
                                                                    i32.const 4
                                                                    i32.add
                                                                    global.set 0
                                                                    local.get 41
                                                                    local.get 40
                                                                    f32.store
                                                                    global.get 0
                                                                    local.set 42
                                                                    global.get 0
                                                                    i32.const 4
                                                                    i32.add
                                                                    global.set 0
                                                                    local.get 42
                                                                    i32.const 0
                                                                    i32.store
                                                                    i32.const 27
                                                                    local.set 109
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 17
                                                                  local.set 109
                                                                  br 29 (;@2;)
                                                                end
                                                                i32.const 21
                                                                local.set 109
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 41
                                                              f32.load
                                                              local.set 43
                                                              local.get 10
                                                              i32.load
                                                              local.set 44
                                                              local.get 44
                                                              f32.convert_i32_s
                                                              local.set 45
                                                              local.get 43
                                                              local.get 45
                                                              f32.div
                                                              local.set 46
                                                              global.get 0
                                                              local.set 47
                                                              global.get 0
                                                              i32.const 4
                                                              i32.add
                                                              global.set 0
                                                              local.get 47
                                                              local.get 46
                                                              f32.store
                                                              i32.const 1
                                                              f32.convert_i32_s
                                                              local.set 48
                                                              local.get 47
                                                              f32.load
                                                              local.set 49
                                                              local.get 11
                                                              f32.load
                                                              local.set 50
                                                              local.get 49
                                                              local.get 50
                                                              f32.add
                                                              local.set 51
                                                              local.get 51
                                                              f64.promote_f32
                                                              local.set 52
                                                              local.get 52
                                                              call 0
                                                              local.set 53
                                                              local.get 53
                                                              f32.demote_f64
                                                              local.set 54
                                                              local.get 48
                                                              local.get 54
                                                              f32.div
                                                              local.set 55
                                                              global.get 0
                                                              local.set 56
                                                              global.get 0
                                                              i32.const 4
                                                              i32.add
                                                              global.set 0
                                                              local.get 56
                                                              local.get 55
                                                              f32.store
                                                              local.get 42
                                                              i32.const 0
                                                              i32.store
                                                              i32.const 38
                                                              local.set 109
                                                              br 27 (;@2;)
                                                            end
                                                            i32.const 25
                                                            local.set 109
                                                            br 26 (;@2;)
                                                          end
                                                          local.get 42
                                                          i32.load
                                                          local.set 57
                                                          local.get 10
                                                          i32.load
                                                          local.set 58
                                                          local.get 57
                                                          local.get 58
                                                          i32.lt_s
                                                          local.set 59
                                                          local.get 59
                                                          if  ;; label = @28
                                                            i32.const 31
                                                            local.set 109
                                                            br 26 (;@2;)
                                                          else
                                                            i32.const 32
                                                            local.set 109
                                                            br 26 (;@2;)
                                                          end
                                                        end
                                                        i32.const 26
                                                        local.set 109
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 27
                                                      local.set 109
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 29
                                                    local.set 109
                                                    br 22 (;@2;)
                                                  end
                                                  local.get 7
                                                  i32.load
                                                  local.set 60
                                                  local.get 19
                                                  i32.load
                                                  local.set 61
                                                  local.get 10
                                                  i32.load
                                                  local.set 62
                                                  local.get 61
                                                  local.get 62
                                                  i32.mul
                                                  local.set 63
                                                  local.get 42
                                                  i32.load
                                                  local.set 64
                                                  local.get 63
                                                  local.get 64
                                                  i32.add
                                                  local.set 65
                                                  local.get 60
                                                  local.get 65
                                                  i32.const 4
                                                  i32.mul
                                                  i32.add
                                                  local.set 66
                                                  local.get 66
                                                  f32.load
                                                  local.set 67
                                                  global.get 0
                                                  local.set 68
                                                  global.get 0
                                                  i32.const 4
                                                  i32.add
                                                  global.set 0
                                                  local.get 68
                                                  local.get 67
                                                  f32.store
                                                  local.get 41
                                                  f32.load
                                                  local.set 69
                                                  local.get 68
                                                  f32.load
                                                  local.set 70
                                                  local.get 68
                                                  f32.load
                                                  local.set 71
                                                  local.get 70
                                                  local.get 71
                                                  f32.mul
                                                  local.set 72
                                                  local.get 69
                                                  local.get 72
                                                  f32.add
                                                  local.set 73
                                                  local.get 41
                                                  local.get 73
                                                  f32.store
                                                  local.get 42
                                                  i32.load
                                                  local.set 74
                                                  local.get 74
                                                  i32.const 1
                                                  i32.add
                                                  local.set 75
                                                  local.get 42
                                                  local.get 75
                                                  i32.store
                                                  i32.const 33
                                                  local.set 109
                                                  br 21 (;@2;)
                                                end
                                                i32.const 26
                                                local.set 109
                                                br 20 (;@2;)
                                              end
                                              i32.const 30
                                              local.set 109
                                              br 19 (;@2;)
                                            end
                                            i32.const 33
                                            local.set 109
                                            br 18 (;@2;)
                                          end
                                          i32.const 27
                                          local.set 109
                                          br 17 (;@2;)
                                        end
                                        local.get 19
                                        i32.load
                                        local.set 76
                                        local.get 76
                                        i32.const 1
                                        i32.add
                                        local.set 77
                                        local.get 19
                                        local.get 77
                                        i32.store
                                        i32.const 47
                                        local.set 109
                                        br 16 (;@2;)
                                      end
                                      i32.const 36
                                      local.set 109
                                      br 15 (;@2;)
                                    end
                                    local.get 42
                                    i32.load
                                    local.set 78
                                    local.get 10
                                    i32.load
                                    local.set 79
                                    local.get 78
                                    local.get 79
                                    i32.lt_s
                                    local.set 80
                                    local.get 80
                                    if  ;; label = @17
                                      i32.const 42
                                      local.set 109
                                      br 15 (;@2;)
                                    else
                                      i32.const 43
                                      local.set 109
                                      br 15 (;@2;)
                                    end
                                  end
                                  i32.const 37
                                  local.set 109
                                  br 13 (;@2;)
                                end
                                i32.const 38
                                local.set 109
                                br 12 (;@2;)
                              end
                              i32.const 40
                              local.set 109
                              br 11 (;@2;)
                            end
                            local.get 7
                            i32.load
                            local.set 81
                            local.get 19
                            i32.load
                            local.set 82
                            local.get 10
                            i32.load
                            local.set 83
                            local.get 82
                            local.get 83
                            i32.mul
                            local.set 84
                            local.get 42
                            i32.load
                            local.set 85
                            local.get 84
                            local.get 85
                            i32.add
                            local.set 86
                            local.get 81
                            local.get 86
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 87
                            local.get 87
                            f32.load
                            local.set 88
                            local.get 56
                            f32.load
                            local.set 89
                            local.get 88
                            local.get 89
                            f32.mul
                            local.set 90
                            global.get 0
                            local.set 91
                            global.get 0
                            i32.const 4
                            i32.add
                            global.set 0
                            local.get 91
                            local.get 90
                            f32.store
                            local.get 91
                            f32.load
                            local.set 92
                            local.get 8
                            i32.load
                            local.set 93
                            local.get 42
                            i32.load
                            local.set 94
                            local.get 93
                            local.get 94
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 95
                            local.get 95
                            f32.load
                            local.set 96
                            local.get 92
                            local.get 96
                            f32.mul
                            local.set 97
                            local.get 12
                            i32.load
                            local.set 98
                            local.get 12
                            i32.load
                            local.set 99
                            local.get 19
                            i32.load
                            local.set 100
                            local.get 10
                            i32.load
                            local.set 101
                            local.get 100
                            local.get 101
                            i32.mul
                            local.set 102
                            local.get 42
                            i32.load
                            local.set 103
                            local.get 102
                            local.get 103
                            i32.add
                            local.set 104
                            local.get 12
                            i32.load
                            local.set 105
                            local.get 105
                            local.get 104
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 106
                            local.get 106
                            local.get 97
                            f32.store
                            local.get 42
                            i32.load
                            local.set 107
                            local.get 107
                            i32.const 1
                            i32.add
                            local.set 108
                            local.get 42
                            local.get 108
                            i32.store
                            i32.const 44
                            local.set 109
                            br 10 (;@2;)
                          end
                          i32.const 37
                          local.set 109
                          br 9 (;@2;)
                        end
                        i32.const 41
                        local.set 109
                        br 8 (;@2;)
                      end
                      i32.const 44
                      local.set 109
                      br 7 (;@2;)
                    end
                    i32.const 38
                    local.set 109
                    br 6 (;@2;)
                  end
                  i32.const 24
                  local.set 109
                  br 5 (;@2;)
                end
                i32.const 24
                local.set 109
                br 4 (;@2;)
              end
              i32.const 18
              local.set 109
              br 3 (;@2;)
            end
            i32.const 52
            local.set 109
            br 2 (;@2;)
          end
          i32.const 50
          local.set 109
          br 1 (;@2;)
        end
        i32.const 1
        local.set 109
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;9;) (type 5) (param i32 i32 i32 i32 f32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 9
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 8
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                local.get 5
                local.get 6
                call 8
                local.set 7
                local.get 9
                global.set 0
                local.get 7
                return
              end
              local.get 9
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 8
            br 2 (;@2;)
          end
          i32.const 2
          local.set 8
          br 1 (;@2;)
        end
        i32.const 1
        local.set 8
        br 0 (;@2;)
      end
    end
    unreachable)
  (table (;0;) 9 9 funcref)
  (memory (;0;) 16)
  (global (;0;) (mut i32) (i32.const 65536))
  (global (;1;) (mut i32) (i32.const 196608))
  (global (;2;) (mut i32) (i32.const 0))
  (global (;3;) (mut i32) (i32.const 0))
  (global (;4;) (mut i32) (i32.const -1))
  (global (;5;) (mut i32) (i32.const 0))
  (global (;6;) (mut i32) (i32.const 0))
  (global (;7;) (mut i32) (i32.const 0))
  (global (;8;) (mut i32) (i32.const 0))
  (global (;9;) (mut i32) (i32.const 0))
  (global (;10;) (mut i32) (i32.const 0))
  (export "memory" (memory 0))
  (export "__hike_sp" (global 0))
  (export "__hike_heap" (global 1))
  (export "__hike_impl_Affine" (func 1))
  (export "Affine" (func 2))
  (export "__hike_impl_MatMul" (func 3))
  (export "MatMul" (func 4))
  (export "main" (func 5))
  (export "__hike_impl_Divide" (func 6))
  (export "Divide" (func 7))
  (export "__hike_impl_RMSNorm" (func 8))
  (export "RMSNorm" (func 9))
  (elem (;0;) (i32.const 0) func 1 2 3 4 5 6 7 8 9))
